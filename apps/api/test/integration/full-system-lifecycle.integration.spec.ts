import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac, AccountingPurpose as DbPurpose } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import { AccountingReportsService } from '../../src/modules/accounting/application/reports.service';
import { ExpenseCategoriesService } from '../../src/modules/expenses/application/expense-categories.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/**
 * FASE 6 — SIMULACIÓN INTEGRAL MULTIDÍA DE EXTREMO A EXTREMO (E2E / SLICE 11.9)
 *
 * Simulación operativa multianual/multidía que integra todas las áreas del monolito:
 * - Día 1: Aporte de capital de apertura ($52.000.000) a Banco y Caja menor.
 * - Día 2: Compra formal a crédito de medicamentos con múltiples lotes y vencimientos (FEFO).
 * - Día 3: Ventas POS (efectivo, transferencia bancaria y crédito) con asignación estricta FEFO.
 * - Día 4: Cobro de cartera (CXC), abono a proveedores (CXP), gastos operativos y anulación de venta.
 * - Día 5: Cierre del período fiscal, liquidación a Utilidad del Ejercicio (3605) y Balance General cuadrado.
 */
describe('Full System Multi-day Lifecycle Simulation (PostgreSQL Real)', () => {
  let app: INestApplication;
  let adminCookie: string;
  let cajeroCookie: string;
  let carteraCookie: string;
  let adminUserId: string;

  let journalService: JournalService;
  let reportsService: AccountingReportsService;
  let expenseCategoriesService: ExpenseCategoriesService;

  // Cuentas contables
  const accountMap = new Map<string, any>();

  // Tesorería
  let bankAccountId: string;

  // Catálogo y Ubicación
  let supplierId: string;
  let defaultCustomerId: string;
  let regularCustomerId: string;
  let warehouseLocationId: string;

  // Medicamento 1: Amoxicilina (lotes con vencimiento próximo y lejano)
  let amoxProductId: string;
  let amoxBoxPresId: string;

  // Medicamento 2: Acetaminofén
  let acetProductId: string;
  let acetBlisterPresId: string;

  // Lotes
  let lotAmoxCloseId: string;
  let lotAmoxFarId: string;
  let lotAcetId: string;

  // Gastos
  let expenseCategoryIdPower: string;
  let expenseCategoryIdRent: string;

  // IDs de transacciones a enlazar entre días
  let purchaseId: string;
  let payableId: string;
  let sale1CashId: string;
  let sale1InvoiceNumber: string;
  let sale2BankId: string;
  let sale3CreditId: string;
  let receivableId: string;

  beforeAll(async () => {
    await cleanTestDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const provisioning = moduleRef.get(UserProvisioningService);
    const auth = moduleRef.get(AuthService);
    journalService = moduleRef.get(JournalService);
    reportsService = moduleRef.get(AccountingReportsService);
    expenseCategoriesService = moduleRef.get(ExpenseCategoriesService);

    await cleanTestDatabase();
    await seedRbac(prisma);

    // 1. Usuarios y Roles
    const adminUser = await provisioning.provisionInitialUser({
      username: 'lifecycle_admin',
      password: 'AdminPassword#2026',
    });
    adminUserId = adminUser.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminUserId, roleId: adminRole.id } });
    const adminLogin = await auth.login('lifecycle_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    const cajeroUser = await prisma.user.create({
      data: { username: 'lifecycle_cajero', passwordHash: adminUser.passwordHash },
    });
    const cajeroRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cajeroUser.id, roleId: cajeroRole.id } });
    const cajeroLogin = await auth.login('lifecycle_cajero', 'AdminPassword#2026');
    cajeroCookie = `${SESSION_COOKIE_NAME}=${cajeroLogin.rawToken}`;

    const carteraUser = await prisma.user.create({
      data: { username: 'lifecycle_cartera', passwordHash: adminUser.passwordHash },
    });
    const carteraRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cartera' } });
    await prisma.userRole.create({ data: { userId: carteraUser.id, roleId: carteraRole.id } });
    const carteraLogin = await auth.login('lifecycle_cartera', 'AdminPassword#2026');
    carteraCookie = `${SESSION_COOKIE_NAME}=${carteraLogin.rawToken}`;

    // 2. PUC Estándar
    const accountsData: Array<{ code: string; name: string; type: any; purpose?: DbPurpose }> = [
      { code: '110505', name: 'Caja General', type: 'ASSET', purpose: 'CASH' },
      { code: '111005', name: 'Bancos Nacionales', type: 'ASSET', purpose: 'BANK' },
      { code: '130505', name: 'Clientes Nacionales', type: 'ASSET', purpose: 'CUSTOMERS' },
      { code: '143501', name: 'Inventario Medicamentos', type: 'ASSET', purpose: 'INVENTORY' },
      { code: '220505', name: 'Proveedores Nacionales', type: 'LIABILITY', purpose: 'SUPPLIERS' },
      { code: '240805', name: 'IVA Generado', type: 'LIABILITY', purpose: 'VAT_OUTPUT' },
      { code: '310505', name: 'Capital Suscrito y Pagado', type: 'EQUITY', purpose: 'CAPITAL' },
      { code: '360505', name: 'Utilidad del Ejercicio', type: 'EQUITY', purpose: 'CURRENT_YEAR_RESULT' },
      { code: '413501', name: 'Ventas Gravadas 19%', type: 'INCOME', purpose: 'SALES_TAXED' },
      { code: '413502', name: 'Ventas Excluidas', type: 'INCOME', purpose: 'SALES_EXCLUDED' },
      { code: '613501', name: 'Costo de Ventas Medicamentos', type: 'COST', purpose: 'COST_OF_SALES' },
      { code: '513530', name: 'Gasto Energía Eléctrica', type: 'EXPENSE' },
      { code: '512005', name: 'Gasto Arrendamientos', type: 'EXPENSE' },
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

    // 3. Tesorería: Cuenta Bancaria Principal
    const bank = await prisma.bankAccount.create({
      data: {
        bankName: 'Bancolombia S.A.',
        accountType: 'CORRIENTE',
        accountNumber: 'CTE-987654321',
        name: 'Cuenta Operativa Principal',
        initialBalance: '0.00',
        currentBalance: '0.00',
        createdById: adminUserId,
      },
    });
    bankAccountId = bank.id;

    // 4. Categorías de Gastos
    const catPower = await expenseCategoriesService.create({
      name: 'Energía Eléctrica',
      accountId: accountMap.get('513530').id,
    });
    expenseCategoryIdPower = catPower.id;

    const catRent = await expenseCategoriesService.create({
      name: 'Arrendamientos',
      accountId: accountMap.get('512005').id,
    });
    expenseCategoryIdRent = catRent.id;

    // 5. Clientes
    const defaultCust = await prisma.customer.upsert({
      where: { documentNumber: '222222222222' },
      update: { isDefault: true, isActive: true },
      create: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final (Cuantías Menores)',
        isDefault: true,
        isActive: true,
      },
    });
    defaultCustomerId = defaultCust.id;

    const regularCust = await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '1098765432',
        name: 'Don Carlos Méndez (Cliente Crédito)',
        isDefault: false,
        isActive: true,
      },
    });
    regularCustomerId = regularCust.id;

    // 6. Proveedor
    const supplier = await prisma.supplier.create({
      data: {
        taxId: '900123456-7',
        name: 'Laboratorios Farmacéuticos Nacionales S.A.S.',
        isActive: true,
      },
    });
    supplierId = supplier.id;

    // 7. Ubicación
    const location = await prisma.location.create({
      data: {
        code: 'BOD-CENTRAL',
        name: 'Bodega Principal Central',
        isDefault: true,
      },
    });
    warehouseLocationId = location.id;

    // 8. Catálogo de Productos y Presentaciones
    const category = await prisma.category.create({
      data: { name: 'Antibióticos y Analgésicos' },
    });

    const amox = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'MED-AMX-500',
        name: 'Amoxicilina 500mg',
        baseUnit: 'CAPSULA',
        basePrice: '800.00',
        baseCost: '400.00',
        requiresLotControl: true,
      },
    });
    amoxProductId = amox.id;

    const amoxPres = await prisma.productPresentation.create({
      data: {
        productId: amox.id,
        name: 'Caja x 30 Cápsulas',
        conversionFactor: 30,
        price: '24000.00',
        cost: '12000.00',
        isDefault: true,
      },
    });
    amoxBoxPresId = amoxPres.id;

    const acet = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'MED-ACT-500',
        name: 'Acetaminofén 500mg',
        baseUnit: 'TABLETA',
        basePrice: '300.00',
        baseCost: '150.00',
        requiresLotControl: true,
      },
    });
    acetProductId = acet.id;

    const acetPres = await prisma.productPresentation.create({
      data: {
        productId: acet.id,
        name: 'Blíster x 10 Tabletas',
        conversionFactor: 10,
        price: '3000.00',
        cost: '1500.00',
        isDefault: true,
      },
    });
    acetBlisterPresId = acetPres.id;

    // 9. Generar los 12 períodos fiscales para 2026 de forma idempotente
    await request(app.getHttpServer())
      .post('/api/v1/accounting/periods/generate')
      .set('Cookie', adminCookie)
      .send({ year: 2026 })
      .expect(201);
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 45000);

  // =========================================================================
  // DÍA 1: APORTE DE CAPITAL Y APERTURA CONTABLE
  // =========================================================================
  describe('Día 1: Aporte de Capital y Apertura Contable', () => {
    it('registra asiento de apertura por aporte de socios ($50M Banco + $2M Caja = $52M Capital)', async () => {
      const entry = await journalService.post({
        entryDate: '2026-10-01',
        description: 'Aporte de Capital Inicial y Apertura de Caja Menor',
        sourceType: 'MANUAL',
        sourceId: 'APORTE-INICIAL-2026',
        createdById: adminUserId,
        lines: [
          {
            accountId: accountMap.get('111005').id,
            description: 'Depósito apertura cuenta bancaria',
            debit: '50000000.00',
            credit: '0.00',
          },
          {
            accountId: accountMap.get('110505').id,
            description: 'Fondo fijo de apertura para caja',
            debit: '2000000.00',
            credit: '0.00',
          },
          {
            accountId: accountMap.get('310505').id,
            description: 'Capital suscrito y pagado por accionistas',
            debit: '0.00',
            credit: '52000000.00',
          },
        ],
      });

      expect(entry.id).toBeDefined();
      expect(entry.status).toBe('POSTED');

      // Sincronizar saldos de tesorería para la simulación
      await prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: { currentBalance: '50000000.00' },
      });

      await prisma.cashMovement.create({
        data: {
          movementType: 'INGRESO_MANUAL',
          amount: '2000000.00',
          paymentMethod: 'EFECTIVO',
          reason: 'Fondo de apertura de caja menor',
          balanceAfter: '2000000.00',
          createdByUserId: adminUserId,
        },
      });

      // Validar Balance General de Día 1
      const bs1 = await reportsService.getBalanceSheet('2026-10-01');
      expect(bs1.isBalanced).toBe(true);
      expect(bs1.difference).toBe('0.00');
      expect(bs1.assets.totalAssets).toBe('52000000.00');
      expect(bs1.equity.totalEquity).toBe('52000000.00');
      expect(bs1.liabilities.totalLiabilities).toBe('0.00');
    });
  });

  // =========================================================================
  // DÍA 2: COMPRA A CRÉDITO CON MÚLTIPLES LOTES Y VENCIMIENTOS (FEFO)
  // =========================================================================
  describe('Día 2: Recepción de Compra a Crédito con Vencimientos FEFO', () => {
    it('POST /api/v1/purchases/receive crea lotes, kardex, CXP y genera asiento de compra', async () => {
      // Recepción de compra:
      // Amoxicilina:
      // - Lote 1: LOT-AMX-CLOSE (vence 2027-03-31): 50 cajas (x30 = 1500 cápsulas), costo unit: $10.000 = $500.000
      // - Lote 2: LOT-AMX-FAR (vence 2028-12-31): 100 cajas (x30 = 3000 cápsulas), costo unit: $10.000 = $1.000.000
      // Acetaminofén:
      // - Lote 3: LOT-ACT-01 (vence 2027-09-30): 200 blísters (x10 = 2000 tabletas), costo unit: $1.200 = $240.000
      // Total compra = $1.740.000 a crédito
      const res = await request(app.getHttpServer())
        .post('/api/v1/purchases/receive')
        .set('Cookie', adminCookie)
        .send({
          supplierId,
          invoiceNumber: 'FAC-PROV-9011',
          purchaseDate: '2026-10-02',
          notes: 'Compra de medicamentos con lotes diferenciados para prueba FEFO',
          lines: [
            {
              productId: amoxProductId,
              presentationId: amoxBoxPresId,
              lotNumber: 'LOT-AMX-CLOSE',
              expirationDate: '2027-03-31',
              quantityCommercial: 50,
              unitCost: 10000,
              locationId: warehouseLocationId,
            },
            {
              productId: amoxProductId,
              presentationId: amoxBoxPresId,
              lotNumber: 'LOT-AMX-FAR',
              expirationDate: '2028-12-31',
              quantityCommercial: 100,
              unitCost: 10000,
              locationId: warehouseLocationId,
            },
            {
              productId: acetProductId,
              presentationId: acetBlisterPresId,
              lotNumber: 'LOT-ACT-01',
              expirationDate: '2027-09-30',
              quantityCommercial: 200,
              unitCost: 1200,
              locationId: warehouseLocationId,
            },
          ],
        });

      expect(res.status).toBe(201);
      purchaseId = res.body.id;
      expect(res.body.totalAmount).toBe('1740000.00');

      // 1. Verificar existencias de lotes creados
      const lot1 = await prisma.inventoryLot.findUniqueOrThrow({
        where: {
          productId_locationId_lotNumber: {
            productId: amoxProductId,
            locationId: warehouseLocationId,
            lotNumber: 'LOT-AMX-CLOSE',
          },
        },
      });
      lotAmoxCloseId = lot1.id;
      expect(lot1.currentQuantity).toBe(1500);

      const lot2 = await prisma.inventoryLot.findUniqueOrThrow({
        where: {
          productId_locationId_lotNumber: {
            productId: amoxProductId,
            locationId: warehouseLocationId,
            lotNumber: 'LOT-AMX-FAR',
          },
        },
      });
      lotAmoxFarId = lot2.id;
      expect(lot2.currentQuantity).toBe(3000);

      const lot3 = await prisma.inventoryLot.findUniqueOrThrow({
        where: {
          productId_locationId_lotNumber: {
            productId: acetProductId,
            locationId: warehouseLocationId,
            lotNumber: 'LOT-ACT-01',
          },
        },
      });
      lotAcetId = lot3.id;
      expect(lot3.currentQuantity).toBe(2000);

      // 2. Verificar Cuenta por Pagar (Payable)
      const payable = await prisma.payable.findUniqueOrThrow({
        where: { purchaseId },
      });
      payableId = payable.id;
      expect(payable.totalAmount.toFixed(2)).toBe('1740000.00');
      expect(payable.balance.toFixed(2)).toBe('1740000.00');
      expect(payable.status).toBe('PENDIENTE');

      // 3. Asiento de compra automático: Inventario debita $1.740.000 vs Proveedores acredita $1.740.000
      const purchaseEntry = await prisma.journalEntry.findUnique({
        where: { sourceType_sourceId: { sourceType: 'PURCHASE', sourceId: purchaseId } },
        include: { lines: true },
      });
      expect(purchaseEntry).not.toBeNull();
      expect(purchaseEntry?.status).toBe('POSTED');

      // 4. Verificar Balance General Día 2
      const bs2 = await reportsService.getBalanceSheet('2026-10-02');
      expect(bs2.isBalanced).toBe(true);
      expect(bs2.difference).toBe('0.00');
      // Activo = $52M (Caja/Banco) + $1.74M (Inventario) = $53.740.000
      expect(bs2.assets.totalAssets).toBe('53740000.00');
      // Pasivo = $1.74M (Proveedores)
      expect(bs2.liabilities.totalLiabilities).toBe('1740000.00');
      // Patrimonio = $52M
      expect(bs2.equity.totalEquity).toBe('52000000.00');
    });
  });

  // =========================================================================
  // DÍA 3: VENTAS POS CON ASIGNACIÓN ESTRICTA FEFO (EFECTIVO, BANCO Y CRÉDITO)
  // =========================================================================
  describe('Día 3: Ventas POS con Despacho Estricto FEFO y Múltiples Medios de Pago', () => {
    it('Venta 1 (Efectivo): Despacha 20 cajas de Amox (600 cápsulas) y descuenta del lote más próximo a vencer', async () => {
      // 20 cajas x $24.000 = $480.000
      // 20 x 30 = 600 cápsulas. Lote próximo (LOT-AMX-CLOSE) tiene 1500. Debe quedar en 900.
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/confirm')
        .set('Cookie', cajeroCookie)
        .set('Idempotency-Key', 'idem-sale-1-cash')
        .send({
          customerId: defaultCustomerId,
          paymentMethod: 'EFECTIVO',
          amountPaid: 500000,
          items: [
            {
              productId: amoxProductId,
              presentationId: amoxBoxPresId,
              quantityCommercial: 20,
            },
          ],
        });

      expect(res.status).toBe(201);
      sale1CashId = res.body.id;
      sale1InvoiceNumber = res.body.invoiceNumber;
      expect(res.body.total).toBe(480000);
      expect(res.body.changeGiven).toBe(20000); // 500.000 - 480.000 = 20.000

      // FEFO check: Lote más próximo consumido
      const alloc = res.body.lines[0].lotAllocations;
      expect(alloc).toHaveLength(1);
      expect(alloc[0].lotNumber).toBe('LOT-AMX-CLOSE');
      expect(alloc[0].quantityBaseUnits).toBe(600);

      // Saldos de lotes en DB
      const lotClose = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotAmoxCloseId } });
      expect(lotClose.currentQuantity).toBe(900); // 1500 - 600 = 900

      const lotFar = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotAmoxFarId } });
      expect(lotFar.currentQuantity).toBe(3000); // Intacto

      // Movimiento de caja registrado
      const cashMov = await prisma.cashMovement.findFirst({
        where: { referenceDocumentId: sale1InvoiceNumber },
      });
      expect(cashMov).not.toBeNull();
      expect(cashMov?.movementType).toBe('INGRESO_VENTA');
      expect(Number(cashMov?.amount)).toBe(480000);
    });

    it('Venta 2 (Transferencia Bancaria): Despacha 40 cajas de Amox (1200 cápsulas), agota LOT-AMX-CLOSE (900) y toma de LOT-AMX-FAR (300)', async () => {
      // 40 cajas x 30 = 1200 cápsulas.
      // LOT-AMX-CLOSE tiene 900 -> lo agota (queda en 0).
      // LOT-AMX-FAR tiene 3000 -> descuenta 300 (queda en 2700).
      // Total venta: 40 x $24.000 = $960.000
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/confirm')
        .set('Cookie', cajeroCookie)
        .set('Idempotency-Key', 'idem-sale-2-bank')
        .send({
          customerId: defaultCustomerId,
          paymentMethod: 'TRANSFERENCIA',
          bankAccountId,
          amountPaid: 960000,
          items: [
            {
              productId: amoxProductId,
              presentationId: amoxBoxPresId,
              quantityCommercial: 40,
            },
          ],
        });

      expect(res.status).toBe(201);
      sale2BankId = res.body.id;
      expect(res.body.total).toBe(960000);

      // FEFO check: división entre dos lotes
      const alloc = res.body.lines[0].lotAllocations;
      expect(alloc).toHaveLength(2);
      expect(alloc[0].lotNumber).toBe('LOT-AMX-CLOSE');
      expect(alloc[0].quantityBaseUnits).toBe(900);
      expect(alloc[1].lotNumber).toBe('LOT-AMX-FAR');
      expect(alloc[1].quantityBaseUnits).toBe(300);

      // Saldos de lotes en DB
      const lotClose = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotAmoxCloseId } });
      expect(lotClose.currentQuantity).toBe(0); // Agotado

      const lotFar = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotAmoxFarId } });
      expect(lotFar.currentQuantity).toBe(2700); // 3000 - 300 = 2700

      // Saldo bancario incrementado en $960.000
      const bank = await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.currentBalance.toFixed(2)).toBe('50960000.00'); // 50M + 960K
    });

    it('Venta 3 (Crédito Cartera): Venta a cliente Don Carlos genera cuenta por cobrar (Receivable) y asiento contable', async () => {
      // 50 blísters de Acetaminofén (x10 = 500 tabletas) x $3.000 = $150.000
      // Lote LOT-ACT-01 pasa de 2000 a 1500 tabletas
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales/confirm')
        .set('Cookie', cajeroCookie)
        .set('Idempotency-Key', 'idem-sale-3-credit')
        .send({
          customerId: regularCustomerId,
          paymentMethod: 'CREDITO',
          notes: 'Venta autorizada a crédito 30 días',
          items: [
            {
              productId: acetProductId,
              presentationId: acetBlisterPresId,
              quantityCommercial: 50,
            },
          ],
        });

      expect(res.status).toBe(201);
      sale3CreditId = res.body.id;
      expect(res.body.total).toBe(150000);

      // Lote consumido
      const lotAcet = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotAcetId } });
      expect(lotAcet.currentQuantity).toBe(1500); // 2000 - 500 = 1500

      // Cuenta por cobrar (Receivable) creada automáticamente
      const rec = await prisma.receivable.findFirstOrThrow({
        where: { saleId: sale3CreditId },
      });
      receivableId = rec.id;
      expect(rec.customerId).toBe(regularCustomerId);
      expect(rec.totalAmount.toFixed(2)).toBe('150000.00');
      expect(rec.balance.toFixed(2)).toBe('150000.00');
      expect(rec.status).toBe('PENDIENTE');

      // Asiento contable de venta a crédito: debita CUSTOMERS
      const saleEntry = await prisma.journalEntry.findUnique({
        where: { sourceType_sourceId: { sourceType: 'SALE', sourceId: sale3CreditId } },
        include: { lines: true },
      });
      expect(saleEntry).not.toBeNull();
      const debitCustLine = saleEntry?.lines.find((l) => l.purpose === 'CUSTOMERS');
      expect(debitCustLine).toBeDefined();
      expect(debitCustLine?.debit.toFixed(2)).toBe('150000.00');
    });
  });

  // =========================================================================
  // DÍA 4: PAGOS, EGRESOS OPERACIONALES Y REVERSIÓN DE VENTA
  // =========================================================================
  describe('Día 4: Cobro de Cartera, Pago a Proveedor, Gastos Operativos y Anulación', () => {
    it('Cobro de Cartera: Don Carlos abona $100.000 en efectivo a su deuda de $150.000', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivableId}/payments`)
        .set('Cookie', carteraCookie)
        .set('Idempotency-Key', 'idem-cxc-payment-1')
        .send({
          amount: '100000.00',
          paymentMethod: 'EFECTIVO',
          reference: 'REC-ABONO-001',
          notes: 'Abono parcial de cliente',
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.balance)).toBe(50000);
      expect(res.body.data.status).toBe('PENDIENTE');

      // Caja incrementada
      const lastCash = await prisma.cashMovement.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      expect(lastCash?.paymentMethod).toBe('EFECTIVO');
    });

    it('Pago a Proveedor: Se transfiere $1.000.000 por banco a la factura de compra de $1.740.000', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/payables/${payableId}/payments`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', 'idem-cxp-payment-1')
        .send({
          amount: '1000000.00',
          paymentMethod: 'TRANSFERENCIA',
          bankAccountId,
          reference: 'TR-PROV-9011',
          notes: 'Abono 1 a factura de compra',
        });

      expect(res.status).toBe(201);
      expect(Number(res.body.data.balance)).toBe(740000);
      expect(res.body.data.status).toBe('PENDIENTE');

      // Saldo bancario reducido en $1.000.000
      const bank = await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.currentBalance.toFixed(2)).toBe('49960000.00'); // 50.960.000 - 1.000.000
    });

    it('Gasto Operativo 1: Factura de energía eléctrica $150.000 en efectivo', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Cookie', adminCookie)
        .send({
          categoryId: expenseCategoryIdPower,
          description: 'Factura de luz Enel Colombia',
          beneficiary: 'Enel Colombia S.A. ESP',
          documentNumber: 'ENEL-2026-01',
          amount: '150000.00',
          expenseDate: '2026-10-03',
          paymentMethod: 'EFECTIVO',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAGADO');
    });

    it('Gasto Operativo 2: Canon de arrendamiento $1.200.000 por transferencia bancaria', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Cookie', adminCookie)
        .send({
          categoryId: expenseCategoryIdRent,
          description: 'Arrendamiento local comercial Enero',
          beneficiary: 'Inmobiliaria El Prado S.A.S.',
          documentNumber: 'ARR-2026-01',
          amount: '1200000.00',
          expenseDate: '2026-10-03',
          paymentMethod: 'TRANSFERENCIA',
          bankAccountId,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAGADO');

      // Saldo bancario actualizado
      const bank = await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId } });
      expect(bank.currentBalance.toFixed(2)).toBe('48760000.00'); // 49.960.000 - 1.200.000
    });

    it('Anulación de Venta 1: POST /api/v1/sales/:id/cancel devuelve existencias a LOT-AMX-CLOSE y reversa contabilidad', async () => {
      // Revertir Venta 1 (20 cajas = 600 cápsulas)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/sales/${sale1CashId}/cancel`)
        .set('Cookie', adminCookie)
        .set('Idempotency-Key', 'cancel-sale-1')
        .send({
          reason: 'Cliente solicita desistimiento formal con ticket',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');

      // Comprobar que LOT-AMX-CLOSE recuperó sus 600 cápsulas (de 0 pasa a 600)
      const lotClose = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotAmoxCloseId } });
      expect(lotClose.currentQuantity).toBe(600);

      // Asiento de reversión creado
      const reversalEntry = await prisma.journalEntry.findFirst({
        where: { reversalReason: { contains: 'Cliente solicita desistimiento' } },
      });
      expect(reversalEntry).toBeDefined();
      expect(reversalEntry?.status).toBe('POSTED');
    });
  });

  // =========================================================================
  // DÍA 5: CIERRE FISCAL, LIQUIDACIÓN Y ESTADOS FINANCIEROS CUADRADOS
  // =========================================================================
  describe('Día 5: Cierre de Período y Verificación Rigurosa de Ecuación Contable', () => {
    it('Consulta Estado de Resultados antes del cierre mensual', async () => {
      const is = await reportsService.getIncomeStatement('2026-10-01', '2026-10-31');

      // Ventas brutas: Venta 2 ($960.000) + Venta 3 ($150.000) = $1.110.000 (Venta 1 fue anulada)
      expect(Number(is.netSales)).toBeGreaterThan(0);
      // Gastos operacionales: $150.000 + $1.200.000 = $1.350.000
      expect(is.totalOperatingExpenses).toBe('1350000.00');
    });

    it('Cierra el período fiscal de Octubre 2026 con asiento de cierre a cuenta 360505', async () => {
      const periods = await request(app.getHttpServer())
        .get('/api/v1/accounting/periods?year=2026')
        .set('Cookie', adminCookie)
        .expect(200);

      const octubre = periods.body.find((p: any) => p.month === 10);
      expect(octubre).toBeDefined();

      const closeRes = await request(app.getHttpServer())
        .post(`/api/v1/accounting/periods/${octubre.id}/close`)
        .set('Cookie', adminCookie)
        .send({
          generateClosingEntry: true,
          notes: 'Cierre mensual consolidado Octubre 2026',
        })
        .expect(201);

      expect(closeRes.body.status).toBe('CLOSED');
      expect(closeRes.body.closingEntryId).not.toBeNull();

      // Verificar que el asiento de cierre cancela ingresos, costos y gastos y está balanceado
      const closingEntry = await prisma.journalEntry.findUnique({
        where: { id: closeRes.body.closingEntryId },
        include: { lines: true },
      });
      expect(closingEntry).not.toBeNull();
      expect(closingEntry?.sourceType).toBe('FISCAL_CLOSING');

      let sumDebit = 0n;
      let sumCredit = 0n;
      for (const line of closingEntry!.lines) {
        sumDebit += BigInt(Math.round(Number(line.debit) * 100));
        sumCredit += BigInt(Math.round(Number(line.credit) * 100));
      }
      expect(sumDebit).toBe(sumCredit);
    });

    it('Bloqueo histórico: Impide asentar nuevas operaciones en Octubre 2026 una vez cerrado', async () => {
      await expect(
        journalService.post({
          entryDate: '2026-10-15',
          description: 'Intento de registro contable en período ya cerrado',
          sourceType: 'MANUAL',
          sourceId: 'ILLEGAL-LATE-ENTRY',
          createdById: adminUserId,
          lines: [
            { accountId: accountMap.get('110505').id, debit: '1000.00', credit: '0.00' },
            { accountId: accountMap.get('413501').id, debit: '0.00', credit: '1000.00' },
          ],
        }),
      ).rejects.toThrow(/período cerrado/i);
    });

    it('Verificación Rigurosa de Balance General: ACTIVO = PASIVO + PATRIMONIO (isBalanced=true, difference=0.00)', async () => {
      const bs = await reportsService.getBalanceSheet('2026-10-31');

      // 1. Ecuación patrimonial cuadrada sin tolerancia ni decimales flotantes
      expect(bs.isBalanced).toBe(true);
      expect(bs.difference).toBe('0.00');

      // 2. Coherencia matemática estricta
      const assetsCents = BigInt(Math.round(Number(bs.assets.totalAssets) * 100));
      const liabCents = BigInt(Math.round(Number(bs.liabilities.totalLiabilities) * 100));
      const equityCents = BigInt(Math.round(Number(bs.equity.totalEquity) * 100));

      expect(assetsCents).toBe(liabCents + equityCents);
      expect(Number(bs.assets.totalAssets)).toBeGreaterThan(0);
    });
  });
});
