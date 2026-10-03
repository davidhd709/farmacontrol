import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import {
  AccountType,
  TrialBalanceReportDto,
  TrialBalanceRowDto,
  GeneralLedgerReportDto,
  GeneralLedgerMovementDto,
} from '@farmacia/contracts';
import { parseJournalDate, normalizeJournalAmount } from '../domain/journal-rules';

function isNormalDebit(type: AccountType): boolean {
  return type === 'ASSET' || type === 'EXPENSE' || type === 'COST';
}

function centsToString(cents: bigint): string {
  const isNegative = cents < 0n;
  const abs = isNegative ? -cents : cents;
  const intPart = abs / 100n;
  const decPart = (abs % 100n).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${intPart}.${decPart}`;
}

@Injectable()
export class AccountingReportsService {
  /**
   * Genera el Balance de Comprobación para un rango de fechas.
   * Total de débitos DEBE ser exactamente igual al total de créditos en el período.
   */
  async getTrialBalance(fromDate: string, toDate: string): Promise<TrialBalanceReportDto> {
    const from = parseJournalDate(fromDate);
    const to = parseJournalDate(toDate);
    if (from > to) {
      throw new BadRequestException('La fecha inicial no puede ser mayor a la fecha final.');
    }
    const toEnd = new Date(`${toDate}T23:59:59.999Z`);

    // 1. Obtener todas las cuentas imputables
    const accounts = await prisma.account.findMany({
      where: { allowsMovement: true },
      orderBy: { code: 'asc' },
    });

    // 2. Saldos iniciales acumulados antes de fromDate (POSTED)
    const initialAggs = await prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          status: 'POSTED',
          entryDate: { lt: from },
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    const initialMap = new Map<string, { debitCents: bigint; creditCents: bigint }>();
    for (const agg of initialAggs) {
      const dCents = agg._sum.debit
        ? normalizeJournalAmount(agg._sum.debit.toFixed(2)).cents
        : 0n;
      const cCents = agg._sum.credit
        ? normalizeJournalAmount(agg._sum.credit.toFixed(2)).cents
        : 0n;
      initialMap.set(agg.accountId, { debitCents: dCents, creditCents: cCents });
    }

    // 3. Movimientos del período entre fromDate y toDate (POSTED)
    const periodAggs = await prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          status: 'POSTED',
          entryDate: { gte: from, lte: toEnd },
        },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    const periodMap = new Map<string, { debitCents: bigint; creditCents: bigint }>();
    for (const agg of periodAggs) {
      const dCents = agg._sum.debit
        ? normalizeJournalAmount(agg._sum.debit.toFixed(2)).cents
        : 0n;
      const cCents = agg._sum.credit
        ? normalizeJournalAmount(agg._sum.credit.toFixed(2)).cents
        : 0n;
      periodMap.set(agg.accountId, { debitCents: dCents, creditCents: cCents });
    }

    let totalPeriodDebitCents = 0n;
    let totalPeriodCreditCents = 0n;
    const rows: TrialBalanceRowDto[] = [];

    for (const acc of accounts) {
      const init = initialMap.get(acc.id) ?? { debitCents: 0n, creditCents: 0n };
      const period = periodMap.get(acc.id) ?? { debitCents: 0n, creditCents: 0n };

      // Solo incluir cuentas con movimiento inicial o en el período
      if (
        init.debitCents === 0n &&
        init.creditCents === 0n &&
        period.debitCents === 0n &&
        period.creditCents === 0n
      ) {
        continue;
      }

      totalPeriodDebitCents += period.debitCents;
      totalPeriodCreditCents += period.creditCents;

      const debitNature = isNormalDebit(acc.type as AccountType);

      // Saldo inicial según naturaleza contable
      const initBalanceCents = debitNature
        ? init.debitCents - init.creditCents
        : init.creditCents - init.debitCents;

      // Saldo final
      const finalBalanceCents = debitNature
        ? initBalanceCents + period.debitCents - period.creditCents
        : initBalanceCents + period.creditCents - period.debitCents;

      rows.push({
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type as AccountType,
        initialBalance: centsToString(initBalanceCents),
        totalDebit: centsToString(period.debitCents),
        totalCredit: centsToString(period.creditCents),
        finalBalance: centsToString(finalBalanceCents),
      });
    }

    return {
      fromDate,
      toDate,
      generatedAt: new Date().toISOString(),
      rows,
      totalDebit: centsToString(totalPeriodDebitCents),
      totalCredit: centsToString(totalPeriodCreditCents),
      isBalanced: totalPeriodDebitCents === totalPeriodCreditCents,
    };
  }

  /**
   * Genera el Libro Mayor / Auxiliar de Cuenta para un rango de fechas.
   */
  async getGeneralLedger(
    accountId: string,
    fromDate: string,
    toDate: string,
  ): Promise<GeneralLedgerReportDto> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException(`Cuenta contable con id '${accountId}' no encontrada.`);
    }

    const from = parseJournalDate(fromDate);
    const to = parseJournalDate(toDate);
    if (from > to) {
      throw new BadRequestException('La fecha inicial no puede ser mayor a la fecha final.');
    }
    const toEnd = new Date(`${toDate}T23:59:59.999Z`);
    const debitNature = isNormalDebit(account.type as AccountType);

    // 1. Saldo inicial acumulado
    const priorLines = await prisma.journalEntryLine.findMany({
      where: {
        accountId,
        journalEntry: {
          status: 'POSTED',
          entryDate: { lt: from },
        },
      },
      select: { debit: true, credit: true },
    });

    let initialCents = 0n;
    for (const l of priorLines) {
      const dCents = normalizeJournalAmount(l.debit.toFixed(2)).cents;
      const cCents = normalizeJournalAmount(l.credit.toFixed(2)).cents;
      if (debitNature) {
        initialCents += dCents - cCents;
      } else {
        initialCents += cCents - dCents;
      }
    }

    // 2. Movimientos en el rango
    const lines = await prisma.journalEntryLine.findMany({
      where: {
        accountId,
        journalEntry: {
          status: 'POSTED',
          entryDate: { gte: from, lte: toEnd },
        },
      },
      include: {
        journalEntry: true,
      },
      orderBy: [
        { journalEntry: { entryDate: 'asc' } },
        { journalEntry: { createdAt: 'asc' } },
        { position: 'asc' },
      ],
    });

    let runningCents = initialCents;
    let totalDebitCents = 0n;
    let totalCreditCents = 0n;
    const movements: GeneralLedgerMovementDto[] = [];

    for (const line of lines) {
      const dCents = normalizeJournalAmount(line.debit.toFixed(2)).cents;
      const cCents = normalizeJournalAmount(line.credit.toFixed(2)).cents;

      totalDebitCents += dCents;
      totalCreditCents += cCents;

      if (debitNature) {
        runningCents += dCents - cCents;
      } else {
        runningCents += cCents - dCents;
      }

      movements.push({
        journalEntryId: line.journalEntryId,
        date: line.journalEntry.entryDate.toISOString().slice(0, 10),
        description: line.description || line.journalEntry.description,
        sourceType: line.journalEntry.sourceType,
        sourceId: line.journalEntry.sourceId,
        debit: line.debit.toFixed(2),
        credit: line.credit.toFixed(2),
        balanceAfter: centsToString(runningCents),
      });
    }

    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      fromDate,
      toDate,
      initialBalance: centsToString(initialCents),
      finalBalance: centsToString(runningCents),
      totalDebit: centsToString(totalDebitCents),
      totalCredit: centsToString(totalCreditCents),
      movements,
    };
  }
}
