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
import { IdempotencyService } from '../../sales/infrastructure/idempotency.service';
import { businessToday } from '../../../common/utils/business-date';

export const ANNUAL_CLOSING_SOURCE = 'ANNUAL_CLOSING';
const ENDPOINT = '/api/v1/accounting/annual-closings';

type Client = Prisma.TransactionClient | typeof prisma;

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
 * Cierre anual (acuerdo del 4 de octubre): con fecha 31 de diciembre se cancelan los saldos
 * de ingresos, costos, gastos y del resultado del ejercicio (3605/3610 o el propósito
 * CURRENT_YEAR_RESULT, que alimentan los cierres mensuales) y el neto pasa a utilidades
 * acumuladas (3705) o pérdidas acumuladas (3710). Así el año nuevo empieza con las cuentas
 * de resultado en cero y el histórico queda intacto. Se hace en febrero o cuando la
 * contabilidad esté al día, por eso solo exige que el año haya terminado.
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

  async close(year: number, userId: string, idempotencyKey: string | undefined): Promise<AnnualClosingResultDto> {
    this.validateYear(year);
    const key = idempotencyKey?.trim();
    if (!key || key.length > 100) {
      throw new AccountingValidationError('Idempotency-Key es obligatorio (máximo 100 caracteres).');
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
                  ? 'Configure el propósito RETAINED_EARNINGS (utilidades acumuladas, 3705) antes del cierre anual.'
                  : 'Configure el propósito ACCUMULATED_LOSSES (pérdidas acumuladas, 3710) antes del cierre anual.',
              );
            }

            const lines: JournalLineInput[] = plan.lines.map((line) => ({
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: `Cancelación ${line.accountCode} ${line.accountName}`.slice(0, 500),
            }));
            if (plan.destinationPurpose && plan.netResultCents !== 0n) {
              const amount = centsToString(plan.netResultCents > 0n ? plan.netResultCents : -plan.netResultCents);
              lines.push({
                purpose: plan.destinationPurpose,
                debit: plan.netResultCents < 0n ? amount : '0.00',
                credit: plan.netResultCents > 0n ? amount : '0.00',
                description:
                  plan.netResultCents > 0n ? `Utilidad del ejercicio ${year}` : `Pérdida del ejercicio ${year}`,
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
            );
            const result: AnnualClosingResultDto = {
              year,
              journalEntryId: entry.id,
              netResult: centsToString(plan.netResultCents),
            };
            await this.idempotencyService.saveRecord(
              { key, userId, endpoint: ENDPOINT, requestHash, responseStatus: 201, responseBody: result },
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
      throw new AccountingValidationError(`El año ${year} aún no ha terminado; el cierre se hace con corte al 31 de diciembre.`);
    }
  }

  private async plan(year: number, client: Client): Promise<ClosingPlan> {
    const entryDate = `${year}-12-31`;
    const cutoff = new Date(`${entryDate}T00:00:00.000Z`);

    const existing = await client.journalEntry.findFirst({
      where: {
        sourceType: ANNUAL_CLOSING_SOURCE,
        sourceId: { startsWith: `${year}-` },
        status: 'POSTED',
        reversal: { is: null },
      },
      select: { id: true },
    });

    const resultMapping = await client.companyAccountingMapping.findFirst({
      where: { purpose: 'CURRENT_YEAR_RESULT', status: 'ACTIVE', accountId: { not: null } },
      select: { accountId: true },
    });

    // Saldos acumulados al 31 de diciembre: los cierres anuales anteriores ya dejaron en cero
    // estas cuentas, así que lo que queda es el resultado pendiente de trasladar.
    const sums = await client.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: { status: 'POSTED', entryDate: { lte: cutoff } },
        account: {
          OR: [
            { type: { in: ['INCOME', 'COST', 'EXPENSE'] } },
            { code: { startsWith: '3605' } },
            { code: { startsWith: '3610' } },
            ...(resultMapping?.accountId ? [{ id: resultMapping.accountId }] : []),
          ],
        },
      },
      _sum: { debit: true, credit: true },
    });

    const accounts = await client.account.findMany({
      where: { id: { in: sums.map((s) => s.accountId) } },
      select: { id: true, code: true, name: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));

    let netResultCents = 0n;
    const lines: AnnualClosingLineDto[] = [];
    for (const sum of sums) {
      const debit = normalizeJournalAmount((sum._sum.debit ?? new Prisma.Decimal(0)).toFixed(2)).cents;
      const credit = normalizeJournalAmount((sum._sum.credit ?? new Prisma.Decimal(0)).toFixed(2)).cents;
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
      const mapping = await client.companyAccountingMapping.findFirst({
        where: {
          purpose: destinationPurpose,
          status: 'ACTIVE',
          accountId: { not: null },
          effectiveFrom: { lte: cutoff },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: cutoff } }],
        },
        include: { account: { select: { id: true, code: true, name: true } } },
      });
      destinationAccount = mapping?.account ?? null;
    }

    return {
      entryDate,
      netResultCents,
      destinationPurpose,
      destinationAccount,
      lines,
      existingEntryId: existing?.id ?? null,
    };
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
