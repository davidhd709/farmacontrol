import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import type {
  AnnualClosingLineDto,
  AnnualClosingPreviewDto,
  AnnualClosingResultDto,
} from '@farmacia/contracts';
import { JournalService } from './journal.service';
import { AccountingConflictError, AccountingValidationError } from '../domain/accounting-rules';
import { normalizeJournalAmount } from '../domain/journal-rules';
import type { JournalLineInput } from '../domain/journal-rules';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { businessToday } from '../../../common/utils/business-date';

export const ANNUAL_CLOSING_SOURCE = 'ANNUAL_CLOSING';
const ENDPOINT = '/api/v1/accounting/annual-closings';
const FISCAL_CLOSING_SOURCE = 'FISCAL_CLOSING';
const NOMINAL_TYPES = ['INCOME', 'COST', 'EXPENSE'] as const;

type Client = Prisma.TransactionClient | typeof prisma;

interface ChainEntry {
  id: string;
  entryDate: Date;
}

/** Un asiento y sus reversiones sucesivas: sigue vigente si se reversó un número par de veces. */
interface ReversalChain {
  root: ChainEntry & { sourceId: string };
  entries: ChainEntry[];
  effective: boolean;
}

/**
 * Líneas de patrimonio atribuibles a cierres mensuales del rango: las marcadas con
 * CURRENT_YEAR_RESULT y las de los asientos FISCAL_CLOSING con toda su cadena de reversiones
 * (las versiones anteriores no guardaban el propósito). Los demás movimientos de la misma
 * cuenta, como aportes de capital, no forman parte del resultado.
 */
function monthlyResultLines(
  from: Date,
  to: Date,
  chainEntryIds: string[],
): Prisma.JournalEntryLineWhereInput {
  return {
    journalEntry: { status: 'POSTED', entryDate: { gte: from, lte: to } },
    account: { type: 'EQUITY' },
    OR: [
      { purpose: 'CURRENT_YEAR_RESULT' },
      ...(chainEntryIds.length ? [{ journalEntryId: { in: chainEntryIds } }] : []),
    ],
  };
}

/** Las reversiones no forman ciclos por la API; datos alterados no deben dejar el cierre en bucle. */
function assertAcyclic(seen: Set<string>, entryId: string): void {
  if (seen.has(entryId)) {
    throw new AccountingConflictError(
      'La cadena de reversiones de un cierre forma un ciclo; revise esos asientos antes del cierre anual.',
    );
  }
  seen.add(entryId);
}

function isWithin(date: Date, from: Date, to: Date): boolean {
  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

/**
 * Cadena de reversiones de cada asiento publicado que cumple el filtro. Una reversión también
 * puede reversarse, así que el asiento sigue vigente si se reversó un número par de veces.
 */
async function reversalChains(
  where: Prisma.JournalEntryWhereInput,
  client: Client,
): Promise<ReversalChain[]> {
  const roots = await client.journalEntry.findMany({
    where: { ...where, status: 'POSTED' },
    select: { id: true, entryDate: true, sourceId: true },
    orderBy: { entryDate: 'asc' },
  });
  const chains: ReversalChain[] = [];
  for (const root of roots) {
    const entries: ChainEntry[] = [root];
    const seen = new Set([root.id]);
    for (;;) {
      const next = await client.journalEntry.findUnique({
        where: { reversalOfId: entries[entries.length - 1].id },
        select: { id: true, entryDate: true, status: true },
      });
      if (!next || next.status !== 'POSTED') break;
      assertAcyclic(seen, next.id);
      entries.push({ id: next.id, entryDate: next.entryDate });
    }
    chains.push({ root, entries, effective: entries.length % 2 === 1 });
  }
  return chains;
}

/** Cierre anual vigente del año, siguiendo la cadena de reversiones de cada intento. */
export async function annualClosingInForce(year: number, client: Client): Promise<string | null> {
  const chains = await reversalChains(
    { sourceType: ANNUAL_CLOSING_SOURCE, sourceId: { startsWith: `${year}-` } },
    client,
  );
  return chains.find((chain) => chain.effective)?.root.id ?? null;
}

function centsToString(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

interface ClosingPlan {
  entryDate: string;
  netResultCents: bigint;
  destinationPurpose: 'RETAINED_EARNINGS' | 'ACCUMULATED_LOSSES' | null;
  destinationAccount: { id: string; code: string; name: string } | null;
  lines: AnnualClosingLineDto[];
  existingEntryId: string | null;
}

/**
 * Cierre anual: con fecha 31 de diciembre se cancelan los saldos de ingresos, costos, gastos
 * y el resultado que los cierres mensuales del año dejaron en patrimonio, y el neto pasa a
 * utilidades acumuladas o pérdidas acumuladas según su propósito contable. Así el año nuevo
 * empieza con las cuentas de resultado en cero y el histórico queda intacto. Se hace en
 * febrero o cuando la contabilidad esté al día, por eso solo exige que el año haya terminado.
 * Si los cierres mensuales no permiten determinar el resultado con certeza, se bloquea.
 */
@Injectable()
export class AnnualClosingService {
  constructor(
    private readonly journalService: JournalService,
    private readonly idempotencyService: IdempotencyService = new IdempotencyService(),
  ) {}

  async preview(year: number): Promise<AnnualClosingPreviewDto> {
    this.validateYear(year);
    const plan = await this.plan(year, prisma);
    return this.toPreview(year, plan);
  }

  async close(
    year: number,
    userId: string,
    idempotencyKey: string | undefined,
  ): Promise<AnnualClosingResultDto> {
    this.validateYear(year);
    const key = idempotencyKey?.trim();
    if (!key || key.length > 100) {
      throw new AccountingValidationError(
        'Idempotency-Key es obligatorio (máximo 100 caracteres).',
      );
    }
    const requestHash = this.idempotencyService.computeHash(ENDPOINT, userId, { year });

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const cached = await this.idempotencyService.getRecord(key, requestHash, tx);
            if (cached) return cached.responseBody as AnnualClosingResultDto;

            const plan = await this.plan(year, tx);
            if (plan.existingEntryId) {
              throw new AccountingConflictError(
                `El año ${year} ya tiene un cierre anual vigente. Revérselo primero si necesita rehacerlo.`,
              );
            }
            if (plan.lines.length === 0) {
              throw new AccountingValidationError(
                `El año ${year} no tiene saldos en cuentas de resultado para cerrar.`,
              );
            }
            if (plan.destinationPurpose && !plan.destinationAccount) {
              throw new AccountingValidationError(
                plan.destinationPurpose === 'RETAINED_EARNINGS'
                  ? 'Configure el propósito RETAINED_EARNINGS (utilidades acumuladas) antes del cierre anual.'
                  : 'Configure el propósito ACCUMULATED_LOSSES (pérdidas acumuladas) antes del cierre anual.',
              );
            }

            const lines: JournalLineInput[] = plan.lines.map((line) => ({
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: `Cancelación ${line.accountCode} ${line.accountName}`.slice(0, 500),
            }));
            if (plan.destinationPurpose && plan.netResultCents !== 0n) {
              const amount = centsToString(
                plan.netResultCents > 0n ? plan.netResultCents : -plan.netResultCents,
              );
              lines.push({
                purpose: plan.destinationPurpose,
                debit: plan.netResultCents < 0n ? amount : '0.00',
                credit: plan.netResultCents > 0n ? amount : '0.00',
                description:
                  plan.netResultCents > 0n
                    ? `Utilidad del ejercicio ${year}`
                    : `Pérdida del ejercicio ${year}`,
              });
            }

            // Un cierre reversado deja su origen ocupado: cada intento usa un sufijo nuevo
            const previous = await tx.journalEntry.count({
              where: { sourceType: ANNUAL_CLOSING_SOURCE, sourceId: { startsWith: `${year}-` } },
            });
            const entry = await this.journalService.post(
              {
                entryDate: plan.entryDate,
                description: `Cierre anual ${year}: traslado del resultado del ejercicio`,
                sourceType: ANNUAL_CLOSING_SOURCE,
                sourceId: `${year}-${previous + 1}`,
                createdById: userId,
                lines,
              },
              tx,
              // Diciembre puede estar cerrado: el cierre anual va después de los mensuales
              { yearEndClosing: true },
            );
            const result: AnnualClosingResultDto = {
              year,
              journalEntryId: entry.id,
              netResult: centsToString(plan.netResultCents),
            };
            await this.idempotencyService.saveRecord(
              {
                key,
                userId,
                endpoint: ENDPOINT,
                requestHash,
                responseStatus: 201,
                responseBody: result,
              },
              tx,
            );
            await tx.auditEvent.create({
              data: {
                userId,
                action: 'accounting:annual_closing',
                entity: 'JournalEntry',
                entityId: entry.id,
                details: { year, netResult: result.netResult },
              },
            });
            return result;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || error.code === 'P2002') &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new AccountingConflictError('No se pudo registrar el cierre anual.');
  }

  private validateYear(year: number): void {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new AccountingValidationError('Año inválido.');
    }
    if (businessToday() <= `${year}-12-31`) {
      throw new AccountingValidationError(
        `El año ${year} aún no ha terminado; el cierre se hace con corte al 31 de diciembre.`,
      );
    }
  }

  private async plan(year: number, client: Client): Promise<ClosingPlan> {
    const entryDate = `${year}-12-31`;
    const cutoff = new Date(`${entryDate}T00:00:00.000Z`);
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);

    const { monthlyEntryIds, existingEntryId } = await this.traceResult(
      year,
      yearStart,
      cutoff,
      client,
    );

    // Ingresos, costos y gastos: saldos acumulados al 31 de diciembre; los cierres anuales
    // anteriores ya los dejaron en cero, así que lo que queda es lo pendiente de trasladar.
    const nominalSums = await client.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: { status: 'POSTED', entryDate: { lte: cutoff } },
        account: { type: { in: [...NOMINAL_TYPES] } },
      },
      _sum: { debit: true, credit: true },
    });
    // Patrimonio: solo el resultado de los cierres mensuales del año, identificado por su
    // origen y no por el saldo completo de la cuenta ni por un código PUC.
    const resultSums = await client.journalEntryLine.groupBy({
      by: ['accountId'],
      where: monthlyResultLines(yearStart, cutoff, monthlyEntryIds),
      _sum: { debit: true, credit: true },
    });
    // Los dos grupos son disjuntos por tipo de cuenta: ninguna línea se cuenta dos veces
    const sums = [...nominalSums, ...resultSums];

    const accounts = await client.account.findMany({
      where: { id: { in: sums.map((s) => s.accountId) } },
      select: { id: true, code: true, name: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));

    let netResultCents = 0n;
    const lines: AnnualClosingLineDto[] = [];
    for (const sum of sums) {
      const debit = normalizeJournalAmount(
        (sum._sum.debit ?? new Prisma.Decimal(0)).toFixed(2),
      ).cents;
      const credit = normalizeJournalAmount(
        (sum._sum.credit ?? new Prisma.Decimal(0)).toFixed(2),
      ).cents;
      const balance = debit - credit; // positivo = saldo débito
      if (balance === 0n) continue;
      netResultCents -= balance;
      const account = byId.get(sum.accountId)!;
      lines.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        // Se lleva al lado contrario para dejarla en cero
        debit: balance < 0n ? centsToString(-balance) : '0.00',
        credit: balance > 0n ? centsToString(balance) : '0.00',
      });
    }
    lines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const destinationPurpose =
      netResultCents > 0n ? 'RETAINED_EARNINGS' : netResultCents < 0n ? 'ACCUMULATED_LOSSES' : null;
    let destinationAccount: ClosingPlan['destinationAccount'] = null;
    if (destinationPurpose) {
      const mappings = await client.companyAccountingMapping.findMany({
        where: {
          purpose: destinationPurpose,
          status: 'ACTIVE',
          accountId: { not: null },
          effectiveFrom: { lte: cutoff },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: cutoff } }],
        },
        include: {
          account: {
            select: { id: true, code: true, name: true, isActive: true, allowsMovement: true },
          },
        },
        take: 2,
      });
      if (mappings.length > 1) {
        throw new AccountingValidationError(
          `Existe más de un mapeo vigente para ${destinationPurpose}; revise la configuración antes del cierre anual.`,
        );
      }
      const mapping = mappings[0];
      if (
        mapping &&
        (!mapping.account || !mapping.account.isActive || !mapping.account.allowsMovement)
      ) {
        throw new AccountingValidationError(
          `El mapeo de ${destinationPurpose} no apunta a una cuenta activa e imputable.`,
        );
      }
      destinationAccount = mapping?.account ?? null;
    }

    return {
      entryDate,
      netResultCents,
      destinationPurpose,
      destinationAccount,
      lines,
      existingEntryId,
    };
  }

  /**
   * El resultado de patrimonio se reconstruye desde los cierres mensuales, siguiendo cada uno
   * por toda su cadena de reversiones. Cuando esa historia no permite saber qué importe
   * trasladar, no se supone ninguno: se informa cada caso y el cierre anual se bloquea hasta
   * que se revisen esos asientos.
   */
  private async traceResult(
    year: number,
    yearStart: Date,
    cutoff: Date,
    client: Client,
  ): Promise<{ monthlyEntryIds: string[]; existingEntryId: string | null }> {
    const day = (date: Date) => date.toISOString().slice(0, 10);
    const outsideYear = (chain: ReversalChain) =>
      chain.entries.filter((entry) => !isWithin(entry.entryDate, yearStart, cutoff));
    const problems: string[] = [];

    const monthly = await reversalChains(
      { sourceType: FISCAL_CLOSING_SOURCE, entryDate: { gte: yearStart, lte: cutoff } },
      client,
    );
    const effectiveByPeriod = new Map<string, { date: Date; count: number }>();
    for (const chain of monthly) {
      for (const entry of outsideYear(chain)) {
        problems.push(
          `el cierre mensual del ${day(chain.root.entryDate)} tiene una reversión fechada el ${day(entry.entryDate)}, fuera del año`,
        );
      }
      if (!chain.effective) continue;
      // El origen es el id del período, con sufijo ":n" cuando se volvió a cerrar
      const period = chain.root.sourceId.split(':')[0];
      const current = effectiveByPeriod.get(period) ?? { date: chain.root.entryDate, count: 0 };
      current.count += 1;
      effectiveByPeriod.set(period, current);
    }
    for (const { date, count } of effectiveByPeriod.values()) {
      if (count > 1) {
        problems.push(
          `el período que termina el ${day(date)} tiene ${count} cierres mensuales vigentes`,
        );
      }
    }

    // Un cierre mensual solo mueve cuentas de resultado y patrimonio; otra cuenta no tiene
    // una lectura segura como resultado del ejercicio
    const foreignLines = await client.journalEntryLine.findMany({
      where: {
        journalEntry: {
          status: 'POSTED',
          entryDate: { gte: yearStart, lte: cutoff },
          sourceType: FISCAL_CLOSING_SOURCE,
        },
        account: { type: { notIn: [...NOMINAL_TYPES, 'EQUITY'] } },
      },
      select: {
        account: { select: { code: true } },
        journalEntry: { select: { entryDate: true } },
      },
    });
    for (const line of foreignLines) {
      problems.push(
        `el cierre mensual del ${day(line.journalEntry.entryDate)} mueve la cuenta ${line.account.code}, que no es de resultado ni de patrimonio`,
      );
    }

    const annual = await reversalChains(
      { sourceType: ANNUAL_CLOSING_SOURCE, sourceId: { startsWith: `${year}-` } },
      client,
    );
    for (const chain of annual) {
      for (const entry of outsideYear(chain)) {
        problems.push(
          `un cierre anual de ${year} tiene una reversión fechada el ${day(entry.entryDate)}, fuera del año`,
        );
      }
    }

    // Una reversión dentro del año de un cierre de otro año alteraría los saldos de este
    const known = new Set([...monthly, ...annual].flatMap((c) => c.entries.map((e) => e.id)));
    const reversalsInYear = await client.journalEntry.findMany({
      where: {
        sourceType: 'REVERSAL',
        status: 'POSTED',
        entryDate: { gte: yearStart, lte: cutoff },
        reversalOf: {
          is: {
            sourceType: { in: [FISCAL_CLOSING_SOURCE, ANNUAL_CLOSING_SOURCE, 'REVERSAL'] },
          },
        },
      },
      select: { id: true, entryDate: true, reversalOfId: true },
    });
    for (const reversal of reversalsInYear) {
      if (known.has(reversal.id) || !reversal.reversalOfId) continue;
      const root = await this.reversalRoot(reversal.reversalOfId, client);
      if (root.sourceType === FISCAL_CLOSING_SOURCE || root.sourceType === ANNUAL_CLOSING_SOURCE) {
        problems.push(
          `la reversión del ${day(reversal.entryDate)} anula un cierre del ${day(root.entryDate)}, de otro año`,
        );
      }
    }

    // Ingresos, costos y gastos se toman acumulados: si un año anterior quedó sin cerrar, su
    // resultado se sumaría a este. Se informa qué años tienen saldo en lugar de trasladarlo.
    const priorNominal = await client.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: { status: 'POSTED', entryDate: { lt: yearStart } },
        account: { type: { in: [...NOMINAL_TYPES] } },
      },
      _sum: { debit: true, credit: true },
    });
    const unbalanced = (sums: typeof priorNominal) =>
      sums.some((sum) => !(sum._sum.debit ?? new Prisma.Decimal(0)).equals(sum._sum.credit ?? 0));
    if (unbalanced(priorNominal)) {
      const nominalYears = await client.$queryRaw<{ year: number }[]>`
        SELECT DISTINCT EXTRACT(YEAR FROM je.entry_date)::int AS year
        FROM journal_entry_lines l
        JOIN journal_entries je ON je.id = l.journal_entry_id
        JOIN accounts a ON a.id = l.account_id
        WHERE je.status = 'POSTED'
          AND je.entry_date < ${yearStart}
          AND a.type IN ('INCOME', 'COST', 'EXPENSE')
        ORDER BY year
      `;
      const pendingYears: number[] = [];
      for (const { year: nominalYear } of nominalYears) {
        const sums = await client.journalEntryLine.groupBy({
          by: ['accountId'],
          where: {
            journalEntry: {
              status: 'POSTED',
              entryDate: {
                gte: new Date(`${nominalYear}-01-01T00:00:00.000Z`),
                lte: new Date(`${nominalYear}-12-31T00:00:00.000Z`),
              },
            },
            account: { type: { in: [...NOMINAL_TYPES] } },
          },
          _sum: { debit: true, credit: true },
        });
        if (unbalanced(sums)) pendingYears.push(nominalYear);
      }
      problems.push(
        pendingYears.length > 0
          ? `${pendingYears.length === 1 ? 'el año' : 'los años'} ${pendingYears.join(', ')} ${pendingYears.length === 1 ? 'tiene' : 'tienen'} saldos de ingresos, costos o gastos sin cierre anual; ciérrelos o concílielos primero`
          : 'las cuentas de ingresos, costos y gastos tienen saldos anteriores al año sin cierre anual; concílielos primero',
      );
    }

    // Un año anterior con resultado mensual sin cierre anual dejaría ese saldo sin trasladar
    const prior = await reversalChains(
      { sourceType: FISCAL_CLOSING_SOURCE, entryDate: { lt: yearStart } },
      client,
    );
    const priorYears = [...new Set(prior.map((c) => c.root.entryDate.getUTCFullYear()))].sort(
      (a, b) => a - b,
    );
    for (const priorYear of priorYears) {
      const priorAnnual = await reversalChains(
        { sourceType: ANNUAL_CLOSING_SOURCE, sourceId: { startsWith: `${priorYear}-` } },
        client,
      );
      if (priorAnnual.some((chain) => chain.effective)) continue;
      const priorEntryIds = prior
        .filter((chain) => chain.root.entryDate.getUTCFullYear() === priorYear)
        .flatMap((chain) => chain.entries.map((entry) => entry.id));
      const pending = await client.journalEntryLine.groupBy({
        by: ['accountId'],
        where: monthlyResultLines(
          new Date(`${priorYear}-01-01T00:00:00.000Z`),
          new Date(`${priorYear}-12-31T00:00:00.000Z`),
          priorEntryIds,
        ),
        _sum: { debit: true, credit: true },
      });
      const hasBalance = pending.some(
        (sum) => !(sum._sum.debit ?? new Prisma.Decimal(0)).equals(sum._sum.credit ?? 0),
      );
      if (hasBalance) {
        problems.push(
          `el año ${priorYear} tiene resultado de cierres mensuales sin un cierre anual vigente`,
        );
      }
    }

    if (problems.length > 0) {
      throw new AccountingConflictError(
        `No es posible determinar con certeza el resultado a trasladar en el cierre anual ${year}: ${problems.join('; ')}. Revise esos asientos antes de cerrar el año.`,
      );
    }
    return {
      monthlyEntryIds: monthly.flatMap((chain) => chain.entries.map((entry) => entry.id)),
      existingEntryId: annual.find((chain) => chain.effective)?.root.id ?? null,
    };
  }

  /** Asiento original de una cadena de reversiones. */
  private async reversalRoot(entryId: string, client: Client) {
    const select = { sourceType: true, entryDate: true, reversalOfId: true } as const;
    let current = await client.journalEntry.findUniqueOrThrow({ where: { id: entryId }, select });
    const seen = new Set([entryId]);
    while (current.sourceType === 'REVERSAL' && current.reversalOfId) {
      assertAcyclic(seen, current.reversalOfId);
      current = await client.journalEntry.findUniqueOrThrow({
        where: { id: current.reversalOfId },
        select,
      });
    }
    return current;
  }

  private toPreview(year: number, plan: ClosingPlan): AnnualClosingPreviewDto {
    return {
      year,
      entryDate: plan.entryDate,
      netResult: centsToString(plan.netResultCents),
      destinationPurpose: plan.destinationPurpose,
      destinationAccount: plan.destinationAccount,
      lines: plan.lines,
      existingEntryId: plan.existingEntryId,
    };
  }
}
