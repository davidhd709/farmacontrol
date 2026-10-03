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
import { validateJournalPost } from '../../src/modules/accounting/domain/journal-rules';

describe('Accounting Engine, Double-Entry, Journal & Reports Integration (PostgreSQL)', () => {
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
      username: 'accounting_lead',
      password: 'AdminPassword#2026',
    });
    adminUserId = user.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: user.id!, roleId: adminRole.id } });
    const login = await auth.login('accounting_lead', 'AdminPassword#2026');
    cookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;

    const cashier = await prisma.user.create({
      data: { username: 'accounting_cashier', passwordHash: user.passwordHash },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('accounting_cashier', 'AdminPassword#2026')).rawToken}`;
  }, 45000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 45000);

  async function setupStandardPucAndMappings() {
    // 1. Crear cuentas PUC
    const accountsData: Array<{ code: string; name: string; type: any; purpose: DbPurpose }> = [
      { code: '110505', name: 'Caja General', type: 'ASSET', purpose: 'CASH' },
      { code: '111005', name: 'Bancos Nacionales', type: 'ASSET', purpose: 'BANK' },
      { code: '130505', name: 'Clientes Nacionales', type: 'ASSET', purpose: 'CUSTOMERS' },
      { code: '143501', name: 'Inventario Medicamentos', type: 'ASSET', purpose: 'INVENTORY' },
      { code: '220505', name: 'Proveedores Nacionales', type: 'LIABILITY', purpose: 'SUPPLIERS' },
      { code: '240805', name: 'IVA Generado', type: 'LIABILITY', purpose: 'VAT_OUTPUT' },
      { code: '413501', name: 'Ventas Gravadas', type: 'INCOME', purpose: 'SALES_TAXED' },
      { code: '413502', name: 'Ventas Excluidas', type: 'INCOME', purpose: 'SALES_EXCLUDED' },
      { code: '613501', name: 'Costo de Ventas Medicamentos', type: 'COST', purpose: 'COST_OF_SALES' },
    ];

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

  beforeEach(async () => {
    // Limpiar tablas operativas contables respetando la inmutabilidad de líneas
    await prisma.$executeRaw`TRUNCATE TABLE "journal_entry_lines", "journal_entries", "company_accounting_mappings", "accounts" CASCADE`;
  });

  describe('Motor de Partida Doble e Invariantes', () => {
    it('rechaza asientos descuadrados donde Débito != Crédito', () => {
      expect(() =>
        validateJournalPost({
          entryDate: '2026-10-01',
          description: 'Asiento descuadrado inválido',
          sourceType: 'SALE',
          sourceId: 'sale-001',
          lines: [
            { purpose: 'CASH', debit: '100.00', credit: '0.00' },
            { purpose: 'SALES_EXCLUDED', debit: '0.00', credit: '90.00' },
          ],
        }),
      ).toThrow('El asiento debe estar balanceado y ser mayor que cero.');
    });

    it('rechaza asientos con líneas con débitos y créditos en cero', () => {
      expect(() =>
        validateJournalPost({
          entryDate: '2026-10-01',
          description: 'Línea en cero',
          sourceType: 'SALE',
          sourceId: 'sale-002',
          lines: [
            { purpose: 'CASH', debit: '0.00', credit: '0.00' },
            { purpose: 'SALES_EXCLUDED', debit: '0.00', credit: '0.00' },
          ],
        }),
      ).toThrow('Cada línea debe tener un único lado positivo.');
    });

    it('publica asiento balanceado en PostgreSQL y valida canPostForPurposes', async () => {
      await setupStandardPucAndMappings();

      const canPost = await journalService.canPostForPurposes(['CASH', 'SALES_EXCLUDED']);
      expect(canPost).toBe(true);

      const canPostMissing = await journalService.canPostForPurposes(['SIMPLE_TAX_ADVANCE']);
      expect(canPostMissing).toBe(false);

      const posted = await journalService.post({
        entryDate: '2026-10-01',
        description: 'Venta mostrador de prueba',
        sourceType: 'SALE',
        sourceId: 'sale-test-101',
        createdById: adminUserId,
        lines: [
          { purpose: 'CASH', debit: '50000.00', credit: '0.00' },
          { purpose: 'SALES_EXCLUDED', debit: '0.00', credit: '50000.00' },
        ],
      });

      expect(posted.id).toBeDefined();
      expect(posted.status).toBe('POSTED');
      expect(posted.lines).toHaveLength(2);
      expect(posted.lines[0].debit.toFixed(2)).toBe('50000.00');
      expect(posted.lines[1].credit.toFixed(2)).toBe('50000.00');
    });

    it('garantiza no-destructividad: reversa asiento creando compensación con reversalOfId', async () => {
      await setupStandardPucAndMappings();

      const original = await journalService.post({
        entryDate: '2026-10-01',
        description: 'Asiento original a revertir',
        sourceType: 'SALE',
        sourceId: 'sale-rev-1',
        createdById: adminUserId,
        lines: [
          { purpose: 'CASH', debit: '25000.00', credit: '0.00' },
          { purpose: 'SALES_EXCLUDED', debit: '0.00', credit: '25000.00' },
        ],
      });

      const reversed = await journalService.reverse({
        entryId: original.id,
        entryDate: '2026-10-02',
        reason: 'Error en digitación de factura',
        createdById: adminUserId,
      });

      expect(reversed.reversalOfId).toBe(original.id);
      expect(reversed.reversalReason).toBe('Error en digitación de factura');
      expect(reversed.lines).toHaveLength(2);
      // El débito original a caja ahora es crédito, y el crédito original a ventas ahora es débito
      expect(reversed.lines[0].credit.toFixed(2)).toBe('25000.00');
      expect(reversed.lines[1].debit.toFixed(2)).toBe('25000.00');

      // El asiento original permanece intacto en base de datos
      const reloadedOriginal = await journalService.findById(original.id);
      expect(reloadedOriginal.status).toBe('POSTED');
    });
  });

  describe('AccountingEngineService: Integración de Eventos Operativos', () => {
    it('contabiliza venta con FEFO, IVA generado, subtotal e inventario de forma balanceada', async () => {
      await setupStandardPucAndMappings();

      // Crear producto con costo base
      const category = await prisma.category.create({
        data: { name: 'Farmacia General', description: 'Categoría test' },
      });
      const product = await prisma.product.create({
        data: {
          code: 'PROD-CONT-01',
          name: 'Amoxicilina 500mg',
          basePrice: 15000,
          baseCost: 8000,
          categoryId: category.id,
        },
      });

      const posted = await engineService.handleSaleConfirmed({
        id: '11111111-1111-1111-1111-111111111111',
        invoiceNumber: 'FAC-00101',
        total: '17850.00', // Subtotal 15.000 + IVA 19% 2.850
        subtotal: '15000.00',
        taxTotal: '2850.00',
        paymentMethod: 'EFECTIVO',
        createdById: adminUserId,
        lines: [
          {
            productId: product.id,
            quantityCommercial: 1,
            quantityBaseUnits: 1,
          },
        ],
      });

      expect(posted).not.toBeNull();
      expect(posted!.status).toBe('POSTED');

      // Líneas esperadas:
      // Débito CAJA: 17.850,00
      // Crédito IVA_OUTPUT: 2.850,00
      // Crédito SALES_TAXED: 15.000,00
      // Débito COST_OF_SALES: 8.000,00
      // Crédito INVENTORY: 8.000,00
      // Total Débitos: 25.850,00 == Total Créditos: 25.850,00
      const dto = await journalService.findById(posted!.id);
      expect(dto.totalDebit).toBe('25850.00');
      expect(dto.totalCredit).toBe('25850.00');

      // Anulación de venta genera reversión automática
      const reversal = await engineService.handleSaleCancelled(
        '11111111-1111-1111-1111-111111111111',
        'Cliente canceló la orden en mostrador',
        adminUserId,
      );
      expect(reversal).not.toBeNull();
      expect(reversal!.reversalOfId).toBe(posted!.id);
    });

    it('contabiliza recepción de compras afectando INVENTORY vs SUPPLIERS', async () => {
      await setupStandardPucAndMappings();

      const posted = await engineService.handlePurchaseReceived({
        id: '22222222-2222-2222-2222-222222222222',
        invoiceNumber: 'COM-00500',
        supplierName: 'Laboratorios Baxter S.A.',
        totalAmount: '450000.00',
        purchaseDate: new Date('2026-10-01'),
        receivedByUserId: adminUserId,
      });

      expect(posted).not.toBeNull();
      const entry = await journalService.findById(posted!.id);
      expect(entry.totalDebit).toBe('450000.00');
      expect(entry.totalCredit).toBe('450000.00');
      expect(entry.lines[0].purpose).toBe('INVENTORY');
      expect(entry.lines[1].purpose).toBe('SUPPLIERS');
    });

    it('contabiliza abonos a cartera de clientes y pagos a proveedores', async () => {
      await setupStandardPucAndMappings();

      // 1. Abono de cartera
      const recPayment = await engineService.handleCustomerPayment({
        id: '33333333-3333-3333-3333-333333333333',
        receivableId: 'rec-001',
        amount: '60000.00',
        paymentMethod: 'TRANSFERENCIA',
        createdByUserId: adminUserId,
        customerName: 'Juan Pérez',
        invoiceNumber: 'FAC-00088',
      });
      expect(recPayment).not.toBeNull();
      const recDto = await journalService.findById(recPayment!.id);
      expect(recDto.lines[0].purpose).toBe('BANK');
      expect(recDto.lines[1].purpose).toBe('CUSTOMERS');
      expect(recDto.totalDebit).toBe('60000.00');
      expect(recDto.totalCredit).toBe('60000.00');

      // 2. Pago a proveedor
      const payPayment = await engineService.handleSupplierPayment({
        id: '44444444-4444-4444-4444-444444444444',
        payableId: 'pay-001',
        amount: '120000.00',
        paymentMethod: 'EFECTIVO',
        createdByUserId: adminUserId,
        supplierName: 'Distribuidora Médica',
        invoiceNumber: 'COM-00123',
      });
      expect(payPayment).not.toBeNull();
      const payDto = await journalService.findById(payPayment!.id);
      expect(payDto.lines[0].purpose).toBe('SUPPLIERS');
      expect(payDto.lines[1].purpose).toBe('CASH');
      expect(payDto.totalDebit).toBe('120000.00');
      expect(payDto.totalCredit).toBe('120000.00');
    });
  });

  describe('Reportes Contables: Balance de Comprobación y Libro Mayor', () => {
    it('genera Balance de Comprobación cuadrado (isBalanced = true) y Libro Mayor con saldo running', async () => {
      await setupStandardPucAndMappings();

      // Crear dos asientos en fechas diferentes
      await journalService.post({
        entryDate: '2026-10-01',
        description: 'Venta inicial día 1',
        sourceType: 'SALE',
        sourceId: 'sale-d1',
        lines: [
          { purpose: 'CASH', debit: '100000.00', credit: '0.00' },
          { purpose: 'SALES_EXCLUDED', debit: '0.00', credit: '100000.00' },
        ],
      });

      await journalService.post({
        entryDate: '2026-10-05',
        description: 'Venta día 5',
        sourceType: 'SALE',
        sourceId: 'sale-d5',
        lines: [
          { purpose: 'CASH', debit: '50000.00', credit: '0.00' },
          { purpose: 'SALES_EXCLUDED', debit: '0.00', credit: '50000.00' },
        ],
      });

      // 1. Balance de Comprobación
      const balance = await reportsService.getTrialBalance('2026-10-01', '2026-10-31');
      expect(balance.isBalanced).toBe(true);
      expect(balance.totalDebit).toBe('150000.00');
      expect(balance.totalCredit).toBe('150000.00');

      const cashRow = balance.rows.find((r) => r.accountCode === '110505');
      expect(cashRow).toBeDefined();
      expect(cashRow!.totalDebit).toBe('150000.00');
      expect(cashRow!.finalBalance).toBe('150000.00');

      // 2. Libro Mayor de Caja (110505)
      const cashAcc = await prisma.account.findUniqueOrThrow({ where: { code: '110505' } });
      const ledger = await reportsService.getGeneralLedger(cashAcc.id, '2026-10-01', '2026-10-31');
      expect(ledger.movements).toHaveLength(2);
      expect(ledger.movements[0].balanceAfter).toBe('100000.00');
      expect(ledger.movements[1].balanceAfter).toBe('150000.00');
      expect(ledger.finalBalance).toBe('150000.00');
    });
  });

  describe('Controladores HTTP y Autorización RBAC', () => {
    it('consulta Libro Diario y revierte asiento por HTTP con permisos', async () => {
      await setupStandardPucAndMappings();

      const posted = await journalService.post({
        entryDate: '2026-10-02',
        description: 'Venta para prueba de API',
        sourceType: 'SALE',
        sourceId: 'sale-api-1',
        lines: [
          { purpose: 'CASH', debit: '30000.00', credit: '0.00' },
          { purpose: 'SALES_EXCLUDED', debit: '0.00', credit: '30000.00' },
        ],
      });

      // 1. GET sin autenticación -> 401
      const unauth = await request(app.getHttpServer()).get('/api/v1/journal-entries');
      expect(unauth.status).toBe(401);

      // 2. GET con autenticación
      const list = await request(app.getHttpServer())
        .get('/api/v1/journal-entries')
        .set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect(list.body.items).toBeInstanceOf(Array);
      expect(list.body.total).toBeGreaterThanOrEqual(1);

      // 3. GET por ID
      const single = await request(app.getHttpServer())
        .get(`/api/v1/journal-entries/${posted.id}`)
        .set('Cookie', cookie);
      expect(single.status).toBe(200);
      expect(single.body.id).toBe(posted.id);

      // 4. Cajero sin permiso de gestión intenta revertir -> 403
      const forbiddenRev = await request(app.getHttpServer())
        .post(`/api/v1/journal-entries/${posted.id}/reverse`)
        .set('Cookie', cashierCookie)
        .send({ reason: 'Reversión no autorizada' });
      expect(forbiddenRev.status).toBe(403);

      // 5. Administrador revierte con éxito -> 201
      const successRev = await request(app.getHttpServer())
        .post(`/api/v1/journal-entries/${posted.id}/reverse`)
        .set('Cookie', cookie)
        .send({ reason: 'Anulación autorizada por auditoría' });
      expect(successRev.status).toBe(201);
      expect(successRev.body.reversalOfId).toBe(posted.id);
    });

    it('consulta Balance de Comprobación y Libro Mayor por HTTP', async () => {
      await setupStandardPucAndMappings();

      const tb = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/trial-balance?fromDate=2026-10-01&toDate=2026-10-31')
        .set('Cookie', cookie);
      expect(tb.status).toBe(200);
      expect(tb.body.isBalanced).toBe(true);

      const cashAcc = await prisma.account.findUniqueOrThrow({ where: { code: '110505' } });
      const gl = await request(app.getHttpServer())
        .get(`/api/v1/accounting/reports/general-ledger?accountId=${cashAcc.id}&fromDate=2026-10-01&toDate=2026-10-31`)
        .set('Cookie', cookie);
      expect(gl.status).toBe(200);
      expect(gl.body.accountId).toBe(cashAcc.id);
    });
  });
});
