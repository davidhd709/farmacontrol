import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import {
  AccountType,
  TrialBalanceReportDto,
  TrialBalanceRowDto,
  GeneralLedgerReportDto,
  GeneralLedgerMovementDto,
  IncomeStatementReportDto,
  OperatingExpenseItemDto,
  BalanceSheetReportDto,
  BalanceSheetCategoryGroupDto,
  BalanceSheetAccountItemDto,
} from '@farmacia/contracts';
import { parseJournalDate, normalizeJournalAmount } from '../domain/journal-rules';
import ExcelJS from 'exceljs';

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

  /**
   * Genera el Estado de Resultados (PyG) para un período determinado.
   */
  async getIncomeStatement(fromDate: string, toDate: string): Promise<IncomeStatementReportDto> {
    const from = parseJournalDate(fromDate);
    const to = parseJournalDate(toDate);
    if (from > to) {
      throw new BadRequestException('La fecha inicial no puede ser mayor a la fecha final.');
    }
    const toEnd = new Date(`${toDate}T23:59:59.999Z`);

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          status: 'POSTED',
          entryDate: { gte: from, lte: toEnd },
        },
        account: {
          type: { in: ['INCOME', 'COST', 'EXPENSE'] },
        },
      },
      include: {
        account: true,
      },
    });

    let grossSalesCents = 0n;
    let returnsCents = 0n;
    let discountsCents = 0n;
    let costOfGoodsSoldCents = 0n;

    const expensesMap = new Map<string, { code: string; name: string; amountCents: bigint }>();

    for (const line of lines) {
      const dCents = normalizeJournalAmount(line.debit.toFixed(2)).cents;
      const cCents = normalizeJournalAmount(line.credit.toFixed(2)).cents;

      if (line.account.type === 'INCOME') {
        const netCents = cCents - dCents;
        if (line.account.code.startsWith('4175') || line.purpose === 'SALES_RETURNS') {
          returnsCents += dCents - cCents;
        } else if (line.account.code.startsWith('413595') || line.purpose === 'SALES_DISCOUNTS') {
          discountsCents += dCents - cCents;
        } else {
          grossSalesCents += netCents;
        }
      } else if (line.account.type === 'COST') {
        const netCents = dCents - cCents;
        costOfGoodsSoldCents += netCents;
      } else if (line.account.type === 'EXPENSE') {
        const netCents = dCents - cCents;
        const current = expensesMap.get(line.accountId) || {
          code: line.account.code,
          name: line.account.name,
          amountCents: 0n,
        };
        current.amountCents += netCents;
        expensesMap.set(line.accountId, current);
      }
    }

    const netSalesCents = grossSalesCents - returnsCents - discountsCents;
    const grossProfitCents = netSalesCents - costOfGoodsSoldCents;

    let totalOperatingExpensesCents = 0n;
    const operatingExpenses: OperatingExpenseItemDto[] = [];

    const sortedExpenses = Array.from(expensesMap.entries()).sort((a, b) =>
      a[1].code.localeCompare(b[1].code),
    );

    for (const [accId, exp] of sortedExpenses) {
      if (exp.amountCents !== 0n) {
        totalOperatingExpensesCents += exp.amountCents;
        operatingExpenses.push({
          accountId: accId,
          accountCode: exp.code,
          accountName: exp.name,
          amount: centsToString(exp.amountCents),
        });
      }
    }

    const operatingIncomeCents = grossProfitCents - totalOperatingExpensesCents;

    const grossMargin =
      netSalesCents > 0n
        ? Math.round((Number(grossProfitCents) / Number(netSalesCents)) * 10000) / 100
        : 0;

    const operatingMargin =
      netSalesCents > 0n
        ? Math.round((Number(operatingIncomeCents) / Number(netSalesCents)) * 10000) / 100
        : 0;

    return {
      fromDate,
      toDate,
      generatedAt: new Date().toISOString(),
      grossSales: centsToString(grossSalesCents),
      returns: centsToString(returnsCents),
      discounts: centsToString(discountsCents),
      netSales: centsToString(netSalesCents),
      costOfGoodsSold: centsToString(costOfGoodsSoldCents),
      grossProfit: centsToString(grossProfitCents),
      grossMarginPercentage: grossMargin,
      operatingExpenses,
      totalOperatingExpenses: centsToString(totalOperatingExpensesCents),
      operatingIncome: centsToString(operatingIncomeCents),
      operatingMarginPercentage: operatingMargin,
      netIncome: centsToString(operatingIncomeCents),
    };
  }

  /**
   * Genera el Estado de Situación Financiera (Balance General) a una fecha de corte.
   */
  async getBalanceSheet(asOfDate: string): Promise<BalanceSheetReportDto> {
    const asOf = parseJournalDate(asOfDate);
    const asOfEnd = new Date(`${asOfDate}T23:59:59.999Z`);

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          status: 'POSTED',
          entryDate: { lte: asOfEnd },
        },
      },
      include: {
        account: true,
      },
    });

    const accountBalances = new Map<
      string,
      { code: string; name: string; type: AccountType; balanceCents: bigint }
    >();

    let incomeCents = 0n;
    let costCents = 0n;
    let expenseCents = 0n;

    for (const line of lines) {
      const dCents = normalizeJournalAmount(line.debit.toFixed(2)).cents;
      const cCents = normalizeJournalAmount(line.credit.toFixed(2)).cents;
      const acc = line.account;

      if (acc.type === 'INCOME') {
        incomeCents += cCents - dCents;
      } else if (acc.type === 'COST') {
        costCents += dCents - cCents;
      } else if (acc.type === 'EXPENSE') {
        expenseCents += dCents - cCents;
      } else {
        // ASSET, LIABILITY, EQUITY
        const current = accountBalances.get(acc.id) || {
          code: acc.code,
          name: acc.name,
          type: acc.type as AccountType,
          balanceCents: 0n,
        };

        if (acc.type === 'ASSET') {
          current.balanceCents += dCents - cCents;
        } else {
          // LIABILITY, EQUITY
          current.balanceCents += cCents - dCents;
        }

        accountBalances.set(acc.id, current);
      }
    }

    const currentPeriodResultCents = incomeCents - costCents - expenseCents;

    // Categorización de cuentas
    const makeGroup = (title: string): { title: string; totalCents: bigint; accounts: BalanceSheetAccountItemDto[] } => ({
      title,
      totalCents: 0n,
      accounts: [],
    });

    const cashAndBanks = makeGroup('Efectivo y Equivalentes de Efectivo (Caja y Bancos)');
    const receivables = makeGroup('Cuentas por Cobrar (Clientes)');
    const inventory = makeGroup('Inventarios de Mercancías');
    const otherCurrentAssets = makeGroup('Otros Activos Corrientes');
    const propertyPlantEquipment = makeGroup('Propiedad, Planta y Equipo');
    const otherNonCurrentAssets = makeGroup('Otros Activos No Corrientes');

    const suppliers = makeGroup('Proveedores');
    const taxes = makeGroup('Impuestos por Pagar (IVA)');
    const otherPayables = makeGroup('Cuentas por Pagar y Otras Obligaciones');
    const longTermPayables = makeGroup('Pasivos No Corrientes (Largo Plazo)');

    const capital = makeGroup('Capital Social');
    const retainedEarnings = makeGroup('Resultados Acumulados');

    for (const [id, acc] of accountBalances) {
      if (acc.balanceCents === 0n) continue;

      const item: BalanceSheetAccountItemDto = {
        accountId: id,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        balance: centsToString(acc.balanceCents),
      };

      if (acc.type === 'ASSET') {
        if (acc.code.startsWith('11')) {
          cashAndBanks.accounts.push(item);
          cashAndBanks.totalCents += acc.balanceCents;
        } else if (acc.code.startsWith('13')) {
          receivables.accounts.push(item);
          receivables.totalCents += acc.balanceCents;
        } else if (acc.code.startsWith('14')) {
          inventory.accounts.push(item);
          inventory.totalCents += acc.balanceCents;
        } else if (acc.code.startsWith('15')) {
          propertyPlantEquipment.accounts.push(item);
          propertyPlantEquipment.totalCents += acc.balanceCents;
        } else if (acc.code.startsWith('1')) {
          if (acc.code < '15') {
            otherCurrentAssets.accounts.push(item);
            otherCurrentAssets.totalCents += acc.balanceCents;
          } else {
            otherNonCurrentAssets.accounts.push(item);
            otherNonCurrentAssets.totalCents += acc.balanceCents;
          }
        }
      } else if (acc.type === 'LIABILITY') {
        if (acc.code.startsWith('22')) {
          suppliers.accounts.push(item);
          suppliers.totalCents += acc.balanceCents;
        } else if (acc.code.startsWith('24')) {
          taxes.accounts.push(item);
          taxes.totalCents += acc.balanceCents;
        } else if (acc.code.startsWith('25') || acc.code >= '25') {
          longTermPayables.accounts.push(item);
          longTermPayables.totalCents += acc.balanceCents;
        } else {
          otherPayables.accounts.push(item);
          otherPayables.totalCents += acc.balanceCents;
        }
      } else if (acc.type === 'EQUITY') {
        if (acc.code.startsWith('31')) {
          capital.accounts.push(item);
          capital.totalCents += acc.balanceCents;
        } else {
          retainedEarnings.accounts.push(item);
          retainedEarnings.totalCents += acc.balanceCents;
        }
      }
    }

    const sortAccs = (g: { accounts: BalanceSheetAccountItemDto[] }) =>
      g.accounts.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    [
      cashAndBanks,
      receivables,
      inventory,
      otherCurrentAssets,
      propertyPlantEquipment,
      otherNonCurrentAssets,
      suppliers,
      taxes,
      otherPayables,
      longTermPayables,
      capital,
      retainedEarnings,
    ].forEach(sortAccs);

    const formatGroup = (g: { title: string; totalCents: bigint; accounts: BalanceSheetAccountItemDto[] }): BalanceSheetCategoryGroupDto => ({
      title: g.title,
      total: centsToString(g.totalCents),
      accounts: g.accounts,
    });

    const totalCurrentAssetsCents =
      cashAndBanks.totalCents + receivables.totalCents + inventory.totalCents + otherCurrentAssets.totalCents;
    const totalNonCurrentAssetsCents =
      propertyPlantEquipment.totalCents + otherNonCurrentAssets.totalCents;
    const totalAssetsCents = totalCurrentAssetsCents + totalNonCurrentAssetsCents;

    const totalCurrentLiabilitiesCents =
      suppliers.totalCents + taxes.totalCents + otherPayables.totalCents;
    const totalNonCurrentLiabilitiesCents = longTermPayables.totalCents;
    const totalLiabilitiesCents = totalCurrentLiabilitiesCents + totalNonCurrentLiabilitiesCents;

    const totalEquityCents = capital.totalCents + retainedEarnings.totalCents + currentPeriodResultCents;
    const totalLiabilitiesAndEquityCents = totalLiabilitiesCents + totalEquityCents;

    const diffCents = totalAssetsCents - totalLiabilitiesAndEquityCents;

    return {
      asOfDate,
      generatedAt: new Date().toISOString(),
      assets: {
        current: {
          cashAndBanks: formatGroup(cashAndBanks),
          receivables: formatGroup(receivables),
          inventory: formatGroup(inventory),
          otherCurrent: formatGroup(otherCurrentAssets),
          total: centsToString(totalCurrentAssetsCents),
        },
        nonCurrent: {
          propertyPlantEquipment: formatGroup(propertyPlantEquipment),
          otherNonCurrent: formatGroup(otherNonCurrentAssets),
          total: centsToString(totalNonCurrentAssetsCents),
        },
        totalAssets: centsToString(totalAssetsCents),
      },
      liabilities: {
        current: {
          suppliers: formatGroup(suppliers),
          taxes: formatGroup(taxes),
          otherPayables: formatGroup(otherPayables),
          total: centsToString(totalCurrentLiabilitiesCents),
        },
        nonCurrent: {
          longTermPayables: formatGroup(longTermPayables),
          total: centsToString(totalNonCurrentLiabilitiesCents),
        },
        totalLiabilities: centsToString(totalLiabilitiesCents),
      },
      equity: {
        capital: formatGroup(capital),
        retainedEarnings: formatGroup(retainedEarnings),
        currentPeriodResult: centsToString(currentPeriodResultCents),
        totalEquity: centsToString(totalEquityCents),
      },
      totalLiabilitiesAndEquity: centsToString(totalLiabilitiesAndEquityCents),
      isBalanced: diffCents === 0n,
      difference: centsToString(diffCents),
    };
  }

  /**
   * Exporta el Balance de Comprobación a Excel.
   */
  async exportTrialBalanceToExcel(fromDate: string, toDate: string): Promise<Buffer> {
    const report = await this.getTrialBalance(fromDate, toDate);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Farmacontrol';
    const sheet = workbook.addWorksheet('Balance de Comprobación');

    sheet.columns = [
      { header: 'Código', key: 'code', width: 15 },
      { header: 'Nombre de la Cuenta', key: 'name', width: 35 },
      { header: 'Tipo', key: 'type', width: 15 },
      { header: 'Saldo Inicial', key: 'initial', width: 18 },
      { header: 'Débitos', key: 'debit', width: 18 },
      { header: 'Créditos', key: 'credit', width: 18 },
      { header: 'Saldo Final', key: 'final', width: 18 },
    ];

    sheet.addRow(['SISTEMA DE GESTIÓN DE FARMACIA - FARMACONTROL']);
    sheet.addRow(['BALANCE DE COMPROBACIÓN']);
    sheet.addRow([`Período: ${fromDate} al ${toDate} | Generado: ${new Date().toLocaleString('es-CO')}`]);
    sheet.addRow([]);

    const headerRow = sheet.addRow([
      'Código',
      'Cuenta',
      'Tipo',
      'Saldo Inicial',
      'Débitos',
      'Créditos',
      'Saldo Final',
    ]);
    headerRow.font = { bold: true };

    for (const r of report.rows) {
      sheet.addRow([
        r.accountCode,
        r.accountName,
        r.accountType,
        parseFloat(r.initialBalance),
        parseFloat(r.totalDebit),
        parseFloat(r.totalCredit),
        parseFloat(r.finalBalance),
      ]);
    }

    const totalRow = sheet.addRow([
      'TOTALES',
      '',
      '',
      '',
      parseFloat(report.totalDebit),
      parseFloat(report.totalCredit),
      '',
    ]);
    totalRow.font = { bold: true };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Exporta el Estado de Resultados a Excel.
   */
  async exportIncomeStatementToExcel(fromDate: string, toDate: string): Promise<Buffer> {
    const report = await this.getIncomeStatement(fromDate, toDate);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Farmacontrol';
    const sheet = workbook.addWorksheet('Estado de Resultados');

    sheet.columns = [
      { header: 'Concepto', key: 'concept', width: 45 },
      { header: 'Monto ($)', key: 'amount', width: 22 },
      { header: 'Margen / %', key: 'margin', width: 15 },
    ];

    sheet.addRow(['SISTEMA DE GESTIÓN DE FARMACIA - FARMACONTROL']);
    sheet.addRow(['ESTADO DE RESULTADOS (PÉRDIDAS Y GANANCIAS)']);
    sheet.addRow([`Período: ${fromDate} al ${toDate} | Generado: ${new Date().toLocaleString('es-CO')}`]);
    sheet.addRow([]);

    sheet.addRow(['1. INGRESOS OPERACIONALES', '', '']).font = { bold: true };
    sheet.addRow(['   Ventas Brutas', parseFloat(report.grossSales), '']);
    sheet.addRow(['   (-) Devoluciones en Ventas', parseFloat(report.returns), '']);
    sheet.addRow(['   (-) Descuentos Comerciales', parseFloat(report.discounts), '']);
    sheet.addRow(['TOTAL VENTAS NETAS', parseFloat(report.netSales), '100%']).font = { bold: true };

    sheet.addRow([]);
    sheet.addRow(['2. COSTO DE VENTAS', '', '']).font = { bold: true };
    sheet.addRow(['   Costo de Mercancía Vendida (FEFO)', parseFloat(report.costOfGoodsSold), '']);
    sheet.addRow(['TOTAL COSTO DE VENTAS', parseFloat(report.costOfGoodsSold), '']).font = { bold: true };

    sheet.addRow([]);
    sheet.addRow([
      'UTILIDAD BRUTA',
      parseFloat(report.grossProfit),
      `${report.grossMarginPercentage}%`,
    ]).font = { bold: true };

    sheet.addRow([]);
    sheet.addRow(['3. GASTOS OPERACIONALES', '', '']).font = { bold: true };
    for (const exp of report.operatingExpenses) {
      sheet.addRow([`   ${exp.accountCode} - ${exp.accountName}`, parseFloat(exp.amount), '']);
    }
    sheet.addRow([
      'TOTAL GASTOS OPERACIONALES',
      parseFloat(report.totalOperatingExpenses),
      '',
    ]).font = { bold: true };

    sheet.addRow([]);
    sheet.addRow([
      'UTILIDAD OPERACIONAL / RESULTADO DEL EJERCICIO',
      parseFloat(report.operatingIncome),
      `${report.operatingMarginPercentage}%`,
    ]).font = { bold: true };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Exporta el Balance General a Excel.
   */
  async exportBalanceSheetToExcel(asOfDate: string): Promise<Buffer> {
    const report = await this.getBalanceSheet(asOfDate);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Farmacontrol';
    const sheet = workbook.addWorksheet('Balance General');

    sheet.columns = [
      { header: 'Grupo / Cuenta', key: 'concept', width: 45 },
      { header: 'Saldo ($)', key: 'amount', width: 22 },
    ];

    sheet.addRow(['SISTEMA DE GESTIÓN DE FARMACIA - FARMACONTROL']);
    sheet.addRow(['ESTADO DE SITUACIÓN FINANCIERA (BALANCE GENERAL)']);
    sheet.addRow([`Fecha de Corte: ${asOfDate} | Generado: ${new Date().toLocaleString('es-CO')}`]);
    sheet.addRow([`Estado: ${report.isBalanced ? 'BALANCE CUADRADO' : 'DESCUADRADO'}`]);
    sheet.addRow([]);

    sheet.addRow(['ACTIVOS', '']).font = { bold: true };
    sheet.addRow(['Activo Corriente', parseFloat(report.assets.current.total)]).font = { bold: true };
    for (const g of [
      report.assets.current.cashAndBanks,
      report.assets.current.receivables,
      report.assets.current.inventory,
      report.assets.current.otherCurrent,
    ]) {
      if (parseFloat(g.total) !== 0 || g.accounts.length > 0) {
        sheet.addRow([`  ${g.title}`, parseFloat(g.total)]);
        for (const a of g.accounts) {
          sheet.addRow([`    ${a.accountCode} - ${a.accountName}`, parseFloat(a.balance)]);
        }
      }
    }

    if (parseFloat(report.assets.nonCurrent.total) !== 0) {
      sheet.addRow(['Activo No Corriente', parseFloat(report.assets.nonCurrent.total)]).font = { bold: true };
    }
    sheet.addRow(['TOTAL ACTIVOS', parseFloat(report.assets.totalAssets)]).font = { bold: true };

    sheet.addRow([]);
    sheet.addRow(['PASIVOS', '']).font = { bold: true };
    sheet.addRow(['Pasivo Corriente', parseFloat(report.liabilities.current.total)]).font = { bold: true };
    for (const g of [
      report.liabilities.current.suppliers,
      report.liabilities.current.taxes,
      report.liabilities.current.otherPayables,
    ]) {
      if (parseFloat(g.total) !== 0 || g.accounts.length > 0) {
        sheet.addRow([`  ${g.title}`, parseFloat(g.total)]);
        for (const a of g.accounts) {
          sheet.addRow([`    ${a.accountCode} - ${a.accountName}`, parseFloat(a.balance)]);
        }
      }
    }
    sheet.addRow(['TOTAL PASIVOS', parseFloat(report.liabilities.totalLiabilities)]).font = { bold: true };

    sheet.addRow([]);
    sheet.addRow(['PATRIMONIO', '']).font = { bold: true };
    sheet.addRow(['  Capital Social', parseFloat(report.equity.capital.total)]);
    sheet.addRow(['  Resultados Acumulados', parseFloat(report.equity.retainedEarnings.total)]);
    sheet.addRow(['  Resultado del Ejercicio Corriente', parseFloat(report.equity.currentPeriodResult)]).font = { bold: true };
    sheet.addRow(['TOTAL PATRIMONIO', parseFloat(report.equity.totalEquity)]).font = { bold: true };

    sheet.addRow([]);
    sheet.addRow(['TOTAL PASIVO Y PATRIMONIO', parseFloat(report.totalLiabilitiesAndEquity)]).font = { bold: true };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

