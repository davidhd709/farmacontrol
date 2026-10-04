import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { prisma, cleanTestDatabase, seedRbac, AccountingPurpose as DbPurpose } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import { AccountingEngineService } from '../../src/modules/accounting/application/accounting-engine.service';
import { AccountingReportsService } from '../../src/modules/accounting/application/reports.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('Financial Statements Integration (PostgreSQL): Income Statement & Balance Sheet', () => {
  let app: INestApplication;
  let cookie: string;
  let cashierCookie: string;
  let adminUserId: string;
  let journalService: JournalService;
  let engineService: AccountingEngineService;
  let reportsService: AccountingReportsService;

  beforeAll(async () => {
    await cleanTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const provisioning = module.get(UserProvisioningService);
    const auth = module.get(AuthService);
    journalService = module.get(JournalService);
    engineService = module.get(AccountingEngineService);
    reportsService = module.get(AccountingReportsService);

    await cleanTestDatabase();
    await seedRbac(prisma);
    const user = await provisioning.provisionInitialUser({
      username: 'fin_reports_admin',
      password: 'AdminPassword#2026',
    });
    adminUserId = user.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: user.id!, roleId: adminRole.id } });
    const login = await auth.login('fin_reports_admin', 'AdminPassword#2026');
    cookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;

    const cashier = await prisma.user.create({
      data: { username: 'fin_reports_cashier', passwordHash: user.passwordHash },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('fin_reports_cashier', 'AdminPassword#2026')).rawToken}`;

    await setupPucAndFiscalOperations();
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 45000);

  async function setupPucAndFiscalOperations() {
    // 1. Cuentas PUC estándar
    const accountsData: Array<{ code: string; name: string; type: any; purpose?: DbPurpose }> = [
      { code: '110505', name: 'Caja General', type: 'ASSET', purpose: 'CASH' },
      { code: '111005', name: 'Bancos Nacionales', type: 'ASSET', purpose: 'BANK' },
      { code: '130505', name: 'Clientes Nacionales', type: 'ASSET', purpose: 'CUSTOMERS' },
      { code: '143501', name: 'Inventario Medicamentos', type: 'ASSET', purpose: 'INVENTORY' },
      { code: '220505', name: 'Proveedores Nacionales', type: 'LIABILITY', purpose: 'SUPPLIERS' },
      { code: '240805', name: 'IVA Generado', type: 'LIABILITY', purpose: 'VAT_OUTPUT' },
      { code: '310505', name: 'Capital Suscrito y Pagado', type: 'EQUITY', purpose: 'CAPITAL' },
      { code: '413501', name: 'Ventas Gravadas 19%', type: 'INCOME', purpose: 'SALES_TAXED' },
      { code: '413502', name: 'Ventas Excluidas', type: 'INCOME', purpose: 'SALES_EXCLUDED' },
      { code: '613501', name: 'Costo de Ventas Medicamentos', type: 'COST', purpose: 'COST_OF_SALES' },
      { code: '513505', name: 'Servicios de Energía Eléctrica', type: 'EXPENSE' },
      { code: '512005', name: 'Arrendamientos Operativos', type: 'EXPENSE' },
    ];

    const accountMap = new Map<string, any>();

    for (const acc of accountsData) {
      const created = await prisma.account.create({
        data: {
          code: acc.code,
          name: acc.name,
          type: acc.type,
          level: 1,
          allowsMovement: true,
          isActive: true,
        },
      });
      accountMap.set(acc.code, created);

      if (acc.purpose) {
        await prisma.companyAccountingMapping.create({
          data: {
            purpose: acc.purpose,
            accountId: created.id,
            status: 'ACTIVE',
            effectiveFrom: new Date('2020-01-01'),
          },
        });
      }
    }

    // 2. Asiento Inicial de Aporte de Capital: Banco $50.000.000 vs Capital $50.000.000
    await journalService.post({
      entryDate: '2026-01-01',
      description: 'Aporte de Capital Inicial',
      sourceType: 'MANUAL',
      sourceId: 'APORTE-001',
      createdById: adminUserId,
      lines: [
        {
          accountId: accountMap.get('111005').id,
          description: 'Ingreso Bancos Capital Inicial',
          debit: '50000000.00',
          credit: '0.00',
        },
        {
          accountId: accountMap.get('310505').id,
          description: 'Aporte de Capital de Socios',
          debit: '0.00',
          credit: '50000000.00',
        },
      ],
    });

    // 3. Recepción de Compra de Inventario a Crédito por $10.000.000
    await journalService.post({
      entryDate: '2026-01-10',
      description: 'Recepción factura compra CP-1001',
      sourceType: 'PURCHASE',
      sourceId: 'compra-inicial-001',
      createdById: adminUserId,
      lines: [
        {
          accountId: accountMap.get('143501').id,
          description: 'Entrada inventario compra CP-1001',
          debit: '10000000.00',
          credit: '0.00',
        },
        {
          accountId: accountMap.get('220505').id,
          description: 'Causación proveedor CP-1001',
          debit: '0.00',
          credit: '10000000.00',
        },
      ],
    });

    // 4. Venta POS en Efectivo: Total $1.190.000 (Base $1.000.000 + IVA $190.000), Costo FEFO = $600.000
    await journalService.post({
      entryDate: '2026-01-15',
      description: 'Venta POS-001 Efectivo',
      sourceType: 'SALE',
      sourceId: 'venta-pos-001',
      createdById: adminUserId,
      lines: [
        {
          accountId: accountMap.get('110505').id,
          description: 'Ingreso a caja',
          debit: '1190000.00',
          credit: '0.00',
        },
        {
          accountId: accountMap.get('240805').id,
          description: 'IVA generado 19%',
          debit: '0.00',
          credit: '190000.00',
        },
        {
          accountId: accountMap.get('413501').id,
          description: 'Venta gravada 19%',
          debit: '0.00',
          credit: '1000000.00',
        },
      ],
    });

    await journalService.post({
      entryDate: '2026-01-15',
      description: 'Costo de ventas FEFO POS-001',
      sourceType: 'SALE_COGS',
      sourceId: 'venta-pos-001-cogs',
      createdById: adminUserId,
      lines: [
        {
          accountId: accountMap.get('613501').id,
          description: 'Costo de mercancía vendida',
          debit: '600000.00',
          credit: '0.00',
        },
        {
          accountId: accountMap.get('143501').id,
          description: 'Salida de inventario lote FEFO',
          debit: '0.00',
          credit: '600000.00',
        },
      ],
    });

    // 5. Venta POS Excluida por Transferencia Bancaria: Total $500.000, Costo FEFO = $300.000
    await journalService.post({
      entryDate: '2026-01-20',
      description: 'Venta POS-002 Transferencia',
      sourceType: 'SALE',
      sourceId: 'venta-pos-002',
      createdById: adminUserId,
      lines: [
        {
          accountId: accountMap.get('111005').id,
          description: 'Ingreso Bancos Transferencia',
          debit: '500000.00',
          credit: '0.00',
        },
        {
          accountId: accountMap.get('413502').id,
          description: 'Venta excluida',
          debit: '0.00',
          credit: '500000.00',
        },
      ],
    });

    await journalService.post({
      entryDate: '2026-01-20',
      description: 'Costo de ventas FEFO POS-002',
      sourceType: 'SALE_COGS',
      sourceId: 'venta-pos-002-cogs',
      createdById: adminUserId,
      lines: [
        {
          accountId: accountMap.get('613501').id,
          description: 'Costo de mercancía vendida',
          debit: '300000.00',
          credit: '0.00',
        },
        {
          accountId: accountMap.get('143501').id,
          description: 'Salida de inventario lote FEFO',
          debit: '0.00',
          credit: '300000.00',
        },
      ],
    });

    // 6. Registro de Gastos Operacionales (Fase 4):
    // Gasto 1: Energía $350.000 pagado en Efectivo
    await journalService.post({
      entryDate: '2026-01-25',
      description: 'Gasto - Enel Codensa: Factura energía eléctrica',
      sourceType: 'EXPENSE',
      sourceId: 'gasto-001',
      createdById: adminUserId,
      lines: [
        {
          accountId: accountMap.get('513505').id,
          description: 'Gasto servicios energía',
          debit: '350000.00',
          credit: '0.00',
        },
        {
          accountId: accountMap.get('110505').id,
          description: 'Desembolso en efectivo',
          debit: '0.00',
          credit: '350000.00',
        },
      ],
    });

    // Gasto 2: Arriendo $1.500.000 a crédito (Pendiente por Pagar)
    await journalService.post({
      entryDate: '2026-01-28',
      description: 'Gasto - Inmobiliaria Central: Canon de arrendamiento',
      sourceType: 'EXPENSE',
      sourceId: 'gasto-002',
      createdById: adminUserId,
      lines: [
        {
          accountId: accountMap.get('512005').id,
          description: 'Gasto de arrendamiento',
          debit: '1500000.00',
          credit: '0.00',
        },
        {
          accountId: accountMap.get('220505').id,
          description: 'Causación cuenta por pagar arrendamiento',
          debit: '0.00',
          credit: '1500000.00',
        },
      ],
    });
  }

  describe('Estado de Resultados (Income Statement / PyG)', () => {
    it('calcula con exactitud Ventas Netas, Costo de Ventas, Utilidad Bruta y Utilidad Operacional', async () => {
      const statement = await reportsService.getIncomeStatement('2026-01-01', '2026-01-31');

      // Ventas Brutas: $1.000.000 (gravada) + $500.000 (excluida) = $1.500.000
      expect(statement.grossSales).toBe('1500000.00');
      expect(statement.returns).toBe('0.00');
      expect(statement.discounts).toBe('0.00');
      expect(statement.netSales).toBe('1500000.00');

      // Costo de ventas: $600.000 + $300.000 = $900.000
      expect(statement.costOfGoodsSold).toBe('900000.00');

      // Utilidad Bruta: $1.500.000 - $900.000 = $600.000
      expect(statement.grossProfit).toBe('600000.00');
      // Margen Bruto: 600.000 / 1.500.000 = 40.00%
      expect(statement.grossMarginPercentage).toBe(40.0);

      // Gastos Operacionales:
      // Energía: $350.000, Arriendo: $1.500.000 -> Total: $1.850.000
      expect(statement.totalOperatingExpenses).toBe('1850000.00');
      expect(statement.operatingExpenses.length).toBe(2);

      // Utilidad Operacional / Resultado: $600.000 - $1.850.000 = -$1.250.000 (Pérdida en este periodo)
      expect(statement.operatingIncome).toBe('-1250000.00');
      expect(statement.netIncome).toBe('-1250000.00');
      // Margen Operacional: -1.250.000 / 1.500.000 = -83.33%
      expect(statement.operatingMarginPercentage).toBe(-83.33);
    });

    it('respeta el rango de fechas para consultar subperiodos', async () => {
      // Período que solo abarca la primera venta
      const statement = await reportsService.getIncomeStatement('2026-01-14', '2026-01-16');

      expect(statement.grossSales).toBe('1000000.00');
      expect(statement.costOfGoodsSold).toBe('600000.00');
      expect(statement.grossProfit).toBe('400000.00');
      expect(statement.totalOperatingExpenses).toBe('0.00');
      expect(statement.operatingIncome).toBe('400000.00');
    });
  });

  describe('Estado de Situación Financiera (Balance General)', () => {
    it('verifica el cumplimiento riguroso de la ecuación contable: ACTIVO = PASIVO + PATRIMONIO', async () => {
      const balanceSheet = await reportsService.getBalanceSheet('2026-01-31');

      // 1. Ecuación Patrimonial Cuadrada
      expect(balanceSheet.isBalanced).toBe(true);
      expect(balanceSheet.difference).toBe('0.00');

      // 2. Activos
      // Caja: +$1.190.000 (Venta) - $350.000 (Gasto Energía) = $840.000
      // Bancos: $50.000.000 (Capital) + $500.000 (Venta) = $50.500.000
      // Inventario: $10.000.000 (Compra) - $900.000 (Costo Ventas) = $9.100.000
      // Total Activos = $840.000 + $50.500.000 + $9.100.000 = $60.440.000
      expect(balanceSheet.assets.totalAssets).toBe('60440000.00');

      // 3. Pasivos
      // Proveedores: $10.000.000 (Compra mercancía) + $1.500.000 (Gasto arriendo crédito) = $11.500.000
      // IVA Generado: $190.000
      // Total Pasivos = $11.500.000 + $190.000 = $11.690.000
      expect(balanceSheet.liabilities.totalLiabilities).toBe('11690000.00');

      // 4. Patrimonio
      // Capital: $50.000.000
      // Resultado del Ejercicio: -$1.250.000
      // Total Patrimonio = $50.000.000 - $1.250.000 = $48.750.000
      expect(balanceSheet.equity.currentPeriodResult).toBe('-1250000.00');
      expect(balanceSheet.equity.totalEquity).toBe('48750000.00');

      // 5. Total Pasivo + Patrimonio:
      // $11.690.000 + $48.750.000 = $60.440.000 (Idéntico a Total Activos)
      expect(balanceSheet.totalLiabilitiesAndEquity).toBe('60440000.00');
      expect(balanceSheet.assets.totalAssets).toBe(balanceSheet.totalLiabilitiesAndEquity);
    });
  });

  describe('Endpoints HTTP, Seguridad RBAC y Exportación a Excel', () => {
    it('GET /api/v1/accounting/reports/income-statement responde 200 con DTO completo a usuarios autorizados', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/income-statement?fromDate=2026-01-01&toDate=2026-01-31')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.grossSales).toBe('1500000.00');
      expect(res.body.netSales).toBe('1500000.00');
      expect(res.body.grossProfit).toBe('600000.00');
    });

    it('GET /api/v1/accounting/reports/balance-sheet responde 200 con balance cuadrado a usuarios autorizados', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/balance-sheet?asOfDate=2026-01-31')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.isBalanced).toBe(true);
      expect(res.body.difference).toBe('0.00');
      expect(res.body.assets.totalAssets).toBe('60440000.00');
    });

    it('deniega acceso a usuarios sin permiso accounting:read (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/income-statement?fromDate=2026-01-01&toDate=2026-01-31')
        .set('Cookie', cashierCookie);

      expect(res.status).toBe(403);
    });

    const binaryParser = (res: any, callback: any) => {
      const data: Buffer[] = [];
      res.on('data', (chunk: Buffer) => data.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(data)));
    };

    it('exporta el Estado de Resultados a Excel en formato .xlsx', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/income-statement/export?fromDate=2026-01-01&toDate=2026-01-31')
        .set('Cookie', cookie)
        .buffer()
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('estado_resultados_2026-01-01_2026-01-31.xlsx');
      expect(res.body.length).toBeGreaterThan(100);
    });

    it('exporta el Balance General a Excel en formato .xlsx', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/balance-sheet/export?asOfDate=2026-01-31')
        .set('Cookie', cookie)
        .buffer()
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('balance_general_2026-01-31.xlsx');
      expect(res.body.length).toBeGreaterThan(100);
    });

    it('exporta el Balance de Comprobación a Excel en formato .xlsx', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/trial-balance/export?fromDate=2026-01-01&toDate=2026-01-31')
        .set('Cookie', cookie)
        .buffer()
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('balance_comprobacion_2026-01-01_2026-01-31.xlsx');
      expect(res.body.length).toBeGreaterThan(100);
    });
  });
});
