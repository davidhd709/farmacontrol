import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import {
  FiscalPeriodDto,
  FiscalPeriodStatus,
  CloseFiscalPeriodPayload,
  ReopenFiscalPeriodPayload,
} from '@farmacia/contracts';
import { JournalService } from './journal.service';
import {
  AccountingNotFoundError,
  AccountingValidationError,
} from '../domain/accounting-rules';
import { normalizeJournalAmount, JournalLineInput } from '../domain/journal-rules';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function centsToString(cents: bigint): string {
  const isNegative = cents < 0n;
  const abs = isNegative ? -cents : cents;
  const intPart = abs / 100n;
  const decPart = (abs % 100n).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${intPart}.${decPart}`;
}

@Injectable()
export class FiscalPeriodsService {
  constructor(private readonly journalService: JournalService) {}

  async listPeriods(filters?: {
    year?: number;
    status?: FiscalPeriodStatus;
  }): Promise<FiscalPeriodDto[]> {
    const where: Prisma.FiscalPeriodWhereInput = {};
    if (filters?.year) {
      where.year = filters.year;
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    const periods = await prisma.fiscalPeriod.findMany({
      where,
      include: {
        closedBy: { select: { id: true, username: true } },
        reopenedBy: { select: { id: true, username: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'asc' }],
    });

    const result: FiscalPeriodDto[] = [];

    for (const p of periods) {
      const stats = await prisma.journalEntryLine.aggregate({
        where: {
          journalEntry: {
            status: 'POSTED',
            entryDate: {
              gte: p.startDate,
              lte: p.endDate,
            },
          },
        },
        _sum: {
          debit: true,
          credit: true,
        },
      });

      const entriesCount = await prisma.journalEntry.count({
        where: {
          status: 'POSTED',
          entryDate: {
            gte: p.startDate,
            lte: p.endDate,
          },
        },
      });

      const totalDebitCents = stats._sum.debit
        ? normalizeJournalAmount(stats._sum.debit.toFixed(2)).cents
        : 0n;
      const totalCreditCents = stats._sum.credit
        ? normalizeJournalAmount(stats._sum.credit.toFixed(2)).cents
        : 0n;

      result.push({
        id: p.id,
        year: p.year,
        month: p.month,
        name: p.name,
        startDate: p.startDate.toISOString().slice(0, 10),
        endDate: p.endDate.toISOString().slice(0, 10),
        status: p.status as FiscalPeriodStatus,
        closedAt: p.closedAt ? p.closedAt.toISOString() : null,
        closedById: p.closedById,
        closedByName: p.closedBy ? p.closedBy.username : null,
        reopenedAt: p.reopenedAt ? p.reopenedAt.toISOString() : null,
        reopenedById: p.reopenedById,
        reopenedByName: p.reopenedBy ? p.reopenedBy.username : null,
        reopenReason: p.reopenReason,
        closingEntryId: p.closingEntryId,
        notes: p.notes,
        entriesCount,
        totalDebits: centsToString(totalDebitCents),
        totalCredits: centsToString(totalCreditCents),
      });
    }

    return result;
  }

  async getPeriodById(id: string): Promise<FiscalPeriodDto> {
    const p = await prisma.fiscalPeriod.findUnique({
      where: { id },
      include: {
        closedBy: { select: { id: true, username: true } },
        reopenedBy: { select: { id: true, username: true } },
      },
    });

    if (!p) {
      throw new AccountingNotFoundError('Período fiscal no encontrado.');
    }

    const stats = await prisma.journalEntryLine.aggregate({
      where: {
        journalEntry: {
          status: 'POSTED',
          entryDate: {
            gte: p.startDate,
            lte: p.endDate,
          },
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    const entriesCount = await prisma.journalEntry.count({
      where: {
        status: 'POSTED',
        entryDate: {
          gte: p.startDate,
          lte: p.endDate,
        },
      },
    });

    const totalDebitCents = stats._sum.debit
      ? normalizeJournalAmount(stats._sum.debit.toFixed(2)).cents
      : 0n;
    const totalCreditCents = stats._sum.credit
      ? normalizeJournalAmount(stats._sum.credit.toFixed(2)).cents
      : 0n;

    return {
      id: p.id,
      year: p.year,
      month: p.month,
      name: p.name,
      startDate: p.startDate.toISOString().slice(0, 10),
      endDate: p.endDate.toISOString().slice(0, 10),
      status: p.status as FiscalPeriodStatus,
      closedAt: p.closedAt ? p.closedAt.toISOString() : null,
      closedById: p.closedById,
      closedByName: p.closedBy ? p.closedBy.username : null,
      reopenedAt: p.reopenedAt ? p.reopenedAt.toISOString() : null,
      reopenedById: p.reopenedById,
      reopenedByName: p.reopenedBy ? p.reopenedBy.username : null,
      reopenReason: p.reopenReason,
      closingEntryId: p.closingEntryId,
      notes: p.notes,
      entriesCount,
      totalDebits: centsToString(totalDebitCents),
      totalCredits: centsToString(totalCreditCents),
    };
  }

  async generateYearPeriods(year: number, _userId?: string): Promise<FiscalPeriodDto[]> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new AccountingValidationError('El año fiscal debe ser un número entero entre 2000 y 2100.');
    }

    for (let m = 1; m <= 12; m++) {
      const startDate = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
      const name = `${MONTH_NAMES[m - 1]} ${year}`;

      await prisma.fiscalPeriod.upsert({
        where: {
          year_month: { year, month: m },
        },
        create: {
          year,
          month: m,
          name,
          startDate,
          endDate,
          status: 'OPEN',
        },
        update: {},
      });
    }

    return this.listPeriods({ year });
  }

  async closePeriod(
    id: string,
    payload: CloseFiscalPeriodPayload,
    userId: string,
  ): Promise<FiscalPeriodDto> {
    const period = await prisma.fiscalPeriod.findUnique({
      where: { id },
    });

    if (!period) {
      throw new AccountingNotFoundError('Período fiscal no encontrado.');
    }

    if (period.status === 'CLOSED') {
      throw new AccountingValidationError('El período fiscal ya se encuentra cerrado.');
    }

    let closingEntryId: string | null = null;

    if (payload.generateClosingEntry) {
      // 1. Obtener movimientos en cuentas de resultado (INCOME, COST, EXPENSE)
      const nominalLines = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            status: 'POSTED',
            entryDate: {
              gte: period.startDate,
              lte: period.endDate,
            },
          },
          account: {
            type: { in: ['INCOME', 'COST', 'EXPENSE'] },
          },
        },
        include: {
          account: true,
        },
      });

      // 2. Agrupar saldos por cuenta
      const balancesMap = new Map<
        string,
        {
          accountId: string;
          accountCode: string;
          accountName: string;
          accountType: string;
          debitCents: bigint;
          creditCents: bigint;
        }
      >();

      for (const line of nominalLines) {
        const dCents = normalizeJournalAmount(line.debit.toFixed(2)).cents;
        const cCents = normalizeJournalAmount(line.credit.toFixed(2)).cents;
        const current = balancesMap.get(line.accountId) || {
          accountId: line.accountId,
          accountCode: line.account.code,
          accountName: line.account.name,
          accountType: line.account.type,
          debitCents: 0n,
          creditCents: 0n,
        };
        current.debitCents += dCents;
        current.creditCents += cCents;
        balancesMap.set(line.accountId, current);
      }

      // 3. Crear líneas de cierre para saldar cuentas nominales
      const closingLines: JournalLineInput[] = [];
      let totalClosingDebitCents = 0n;
      let totalClosingCreditCents = 0n;

      for (const b of balancesMap.values()) {
        if (b.accountType === 'INCOME') {
          // Saldo normal acreedor: saldo = crédito - débito
          const net = b.creditCents - b.debitCents;
          if (net > 0n) {
            // Se debita para cancelar
            closingLines.push({
              accountId: b.accountId,
              debit: centsToString(net),
              credit: '0.00',
              description: `Cancelación saldo ${b.accountCode} - ${b.accountName}`,
            });
            totalClosingDebitCents += net;
          } else if (net < 0n) {
            // Saldo deudor (descuentos/devoluciones): se acredita para cancelar
            const abs = -net;
            closingLines.push({
              accountId: b.accountId,
              debit: '0.00',
              credit: centsToString(abs),
              description: `Cancelación saldo ${b.accountCode} - ${b.accountName}`,
            });
            totalClosingCreditCents += abs;
          }
        } else {
          // COST o EXPENSE: Saldo normal deudor: saldo = débito - crédito
          const net = b.debitCents - b.creditCents;
          if (net > 0n) {
            // Se acredita para cancelar
            closingLines.push({
              accountId: b.accountId,
              debit: '0.00',
              credit: centsToString(net),
              description: `Cancelación saldo ${b.accountCode} - ${b.accountName}`,
            });
            totalClosingCreditCents += net;
          } else if (net < 0n) {
            // Saldo acreedor: se debita para cancelar
            const abs = -net;
            closingLines.push({
              accountId: b.accountId,
              debit: centsToString(abs),
              credit: '0.00',
              description: `Cancelación saldo ${b.accountCode} - ${b.accountName}`,
            });
            totalClosingDebitCents += abs;
          }
        }
      }

      // 4. Calcular el Resultado del Ejercicio (diferencia entre débitos y créditos)
      const netResultCents = totalClosingDebitCents - totalClosingCreditCents;

      if (closingLines.length > 0) {
        // Buscar cuenta de patrimonio (CURRENT_YEAR_RESULT o 3605)
        const mapping = await prisma.companyAccountingMapping.findFirst({
          where: {
            purpose: 'CURRENT_YEAR_RESULT',
            status: 'ACTIVE',
            accountId: { not: null },
          },
          include: { account: true },
        });

        let resultAccountId: string | null = mapping?.accountId ?? null;

        if (!resultAccountId) {
          const account3605 = await prisma.account.findFirst({
            where: {
              code: { startsWith: '3605' },
              type: 'EQUITY',
              allowsMovement: true,
              isActive: true,
            },
          });
          resultAccountId = account3605?.id ?? null;
        }

        if (!resultAccountId) {
          const fallbackEquity = await prisma.account.findFirst({
            where: {
              type: 'EQUITY',
              allowsMovement: true,
              isActive: true,
            },
            orderBy: { code: 'desc' },
          });
          resultAccountId = fallbackEquity?.id ?? null;
        }

        if (!resultAccountId) {
          throw new AccountingValidationError(
            'Falta configurar una cuenta de patrimonio imputable para registrar el resultado del ejercicio (CURRENT_YEAR_RESULT o 3605).',
          );
        }

        if (netResultCents > 0n) {
          // Utilidad neta: acreditamos la cuenta de patrimonio
          closingLines.push({
            accountId: resultAccountId,
            debit: '0.00',
            credit: centsToString(netResultCents),
            description: `Utilidad del ejercicio período ${period.name}`,
          });
        } else if (netResultCents < 0n) {
          // Pérdida neta: debitamos la cuenta de patrimonio
          closingLines.push({
            accountId: resultAccountId,
            debit: centsToString(-netResultCents),
            credit: '0.00',
            description: `Pérdida del ejercicio período ${period.name}`,
          });
        }

        // 5. Publicar el asiento de cierre fiscal
        const closingDateStr = period.endDate.toISOString().slice(0, 10);
        const closingEntry = await this.journalService.post({
          entryDate: closingDateStr,
          description: `Cierre contable período ${period.name} (${period.year}-${String(period.month).padStart(2, '0')})`,
          sourceType: 'FISCAL_CLOSING',
          sourceId: period.id,
          createdById: userId,
          lines: closingLines,
        });

        closingEntryId = closingEntry.id;
      }
    }

    // 6. Marcar el período como CERRADO
    await prisma.fiscalPeriod.update({
      where: { id: period.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: userId,
        closingEntryId,
        notes: payload.notes?.trim() || null,
      },
    });

    return this.getPeriodById(period.id);
  }

  async reopenPeriod(
    id: string,
    payload: ReopenFiscalPeriodPayload,
    userId: string,
  ): Promise<FiscalPeriodDto> {
    if (
      !payload ||
      typeof payload.reason !== 'string' ||
      payload.reason.trim().length < 10 ||
      payload.reason.trim().length > 500
    ) {
      throw new AccountingValidationError(
        'El motivo de reapertura es requerido y debe contener entre 10 y 500 caracteres.',
      );
    }

    const period = await prisma.fiscalPeriod.findUnique({
      where: { id },
    });

    if (!period) {
      throw new AccountingNotFoundError('Período fiscal no encontrado.');
    }

    if (period.status !== 'CLOSED') {
      throw new AccountingValidationError('El período fiscal no está cerrado.');
    }

    const reopenReason = payload.reason.trim();

    // 1. Primero reabrimos el período para permitir la reversión del asiento de cierre
    await prisma.fiscalPeriod.update({
      where: { id: period.id },
      data: {
        status: 'OPEN',
        reopenedAt: new Date(),
        reopenedById: userId,
        reopenReason,
      },
    });

    // 2. Si tenía asiento de cierre asociado, lo reversamos
    if (period.closingEntryId) {
      try {
        const reversalDateStr = period.endDate.toISOString().slice(0, 10);
        await this.journalService.reverse({
          entryId: period.closingEntryId,
          entryDate: reversalDateStr,
          reason: `Reversión por reapertura de período: ${reopenReason}`,
          createdById: userId,
        });
      } catch (err) {
        // En caso de error al reversar, registramos en log pero continuamos con la reapertura
        console.error('Error reversando asiento de cierre fiscal:', err);
      }

      await prisma.fiscalPeriod.update({
        where: { id: period.id },
        data: {
          closingEntryId: null,
        },
      });
    }

    return this.getPeriodById(period.id);
  }
}
