import { randomUUID } from 'crypto';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { prisma, cleanTestDatabase, seedRbac, AccountingPurpose as DbPurpose, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { CreditNotesService } from '../../src/modules/sales/application/credit-notes.service';
import { DebitNotesService } from '../../src/modules/purchases/application/debit-notes.service';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('Credit and Debit Notes & Third-Party Reports Integration (PostgreSQL)', () => {
  let app: INestApplication;
  let cookie: string;
  let adminUserId: string;
  let creditNotesService: CreditNotesService;
  let debitNotesService: DebitNotesService;
  let journalService: JournalService;
  let provisioning: UserProvisioningService;
  let auth: AuthService;

  const binaryParser = (res: any, callback: any) => {
    const data: Buffer[] = [];
    res.on('data', (chunk: Buffer) => data.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(data)));
  };

  beforeAll(async () => {
    await cleanTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    provisioning = module.get(UserProvisioningService);
    auth = module.get(AuthService);
    creditNotesService = module.get(CreditNotesService);
    debitNotesService = module.get(DebitNotesService);
    journalService = module.get(JournalService);
  }, 45000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    const user = await provisioning.provisionInitialUser({
      username: 'accounting_nc_admin',
      password: 'AdminPassword#2026',
    });
    adminUserId = user.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: user.id!, roleId: adminRole.id } });
    const login = await auth.login('accounting_nc_admin', 'AdminPassword#2026');
    cookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;

    await prisma.location.upsert({
      where: { code: 'LOC-DEFAULT' },
      update: {},
      create: {
        code: 'LOC-DEFAULT',
        name: 'Bodega Principal',
        isDefault: true,
      },
    });
  });

  async function setupStandardPucAndMappings() {
    const accountsData: Array<{ code: string; name: string; type: any; purpose: DbPurpose }> = [
      { code: '110505', name: 'Caja General', type: 'ASSET', purpose: 'CASH' },
      { code: '111005', name: 'Bancos Nacionales', type: 'ASSET', purpose: 'BANK' },
      { code: '130505', name: 'Clientes Nacionales', type: 'ASSET', purpose: 'CUSTOMERS' },
      { code: '143501', name: 'Inventario Medicamentos', type: 'ASSET', purpose: 'INVENTORY' },
      { code: '220505', name: 'Proveedores Nacionales', type: 'LIABILITY', purpose: 'SUPPLIERS' },
      { code: '240805', name: 'IVA Generado', type: 'LIABILITY', purpose: 'VAT_OUTPUT' },
      { code: '240810', name: 'IVA Descontable', type: 'ASSET', purpose: 'VAT_INPUT' },
      { code: '413501', name: 'Ventas Gravadas', type: 'INCOME', purpose: 'SALES_TAXED' },
      { code: '413502', name: 'Ventas Excluidas', type: 'INCOME', purpose: 'SALES_EXCLUDED' },
      { code: '417505', name: 'Devoluciones en Ventas', type: 'INCOME', purpose: 'SALES_RETURNS' },
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

  describe('RF-033: Notas Crédito (Devoluciones en Ventas a Clientes)', () => {
    it('crea nota crédito con reintegro a inventario (restock), egreso de caja y asiento contable balanceado', async () => {
      await setupStandardPucAndMappings();
      const location = await prisma.location.findFirstOrThrow();

      const customer = await prisma.customer.create({
        data: {
          documentType: 'CC',
          documentNumber: '1098765432',
          name: 'Carlos Ruiz Devolución',
        },
      });

      const category = await prisma.category.create({
        data: { name: 'Medicamentos Test' },
      });

      const product = await prisma.product.create({
        data: {
          code: 'PROD-DEV-01',
          name: 'Acetaminofén 500mg',
          basePrice: 10000,
          baseCost: 5000,
          categoryId: category.id,
        },
      });

      const lot = await prisma.inventoryLot.create({
        data: {
          productId: product.id,
          locationId: location.id,
          lotNumber: 'LOT-DEV-01',
          expirationDate: new Date('2028-12-31'),
          currentQuantity: 8, // quedan 8 tras haber vendido 2
          isActive: true,
        },
      });

      const sale = await prisma.sale.create({
        data: {
          invoiceNumber: 'FAC-DEV-001',
          customerId: customer.id,
          status: 'CONFIRMED',
          subtotal: 20000,
          taxTotal: 3800,
          discountTotal: 0,
          total: 23800,
          paymentMethod: 'EFECTIVO',
          createdById: adminUserId,
        },
      });

      const saleLine = await prisma.saleLine.create({
        data: {
          saleId: sale.id,
          productId: product.id,
          quantityCommercial: 2,
          quantityBaseUnits: 2,
          unitPrice: 10000,
          subtotal: 20000,
          taxRate: 19,
          taxAmount: 3800,
          total: 23800,
          presentationFactorHistorical: 1,
        },
      });

      await prisma.saleLotAllocation.create({
        data: {
          saleId: sale.id,
          saleLineId: saleLine.id,
          lotId: lot.id,
          quantityBaseUnits: 2,
        },
      });

      // Crear saldo previo en caja
      await prisma.cashMovement.create({
        data: {
          movementType: 'INGRESO_MANUAL',
          amount: new Prisma.Decimal(50000),
          paymentMethod: 'EFECTIVO',
          reason: 'Apertura de caja',
          balanceAfter: new Prisma.Decimal(50000),
          createdByUserId: adminUserId,
        },
      });

      // Ejecutar creación de Nota Crédito para 1 unidad con reintegro a inventario
      const nc = await creditNotesService.createCreditNote(
        sale.id,
        {
          saleId: sale.id,
          reason: 'Medicamento con empaque deteriorado',
          restock: true,
          refundMethod: 'EFECTIVO',
          items: [
            {
              saleLineId: saleLine.id,
              quantityCommercial: 1,
            },
          ],
        },
        adminUserId,
      );

      expect(nc).toBeDefined();
      expect(nc.creditNoteNumber).toMatch(/^NC-\d{6}$/);
      expect(Number(nc.total)).toBe(11900); // 10000 + 19% IVA = 11900
      expect(Number(nc.subtotal)).toBe(10000);
      expect(Number(nc.taxTotal)).toBe(1900);
      expect(nc.lines).toHaveLength(1);

      // 1. Verificar lote: debe haber incrementado de 8 a 9
      const reloadedLot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } });
      expect(reloadedLot.currentQuantity).toBe(9);

      // 2. Verificar movimiento de inventario kardex
      const mov = await prisma.inventoryMovement.findFirst({
        where: {
          referenceDocumentType: 'CREDIT_NOTE',
          lotId: lot.id,
        },
      });
      expect(mov).not.toBeNull();
      expect(mov!.movementType).toBe('ENTRADA_DEVOLUCION_VENTA');
      expect(mov!.quantityBaseUnits).toBe(1);
      expect(mov!.balanceAfterBaseUnits).toBe(9);

      // 3. Verificar movimiento de caja: egreso
      const cashMov = await prisma.cashMovement.findFirst({
        where: {
          referenceDocumentType: 'CREDIT_NOTE',
          referenceDocumentId: nc.creditNoteNumber,
        },
      });
      expect(cashMov).not.toBeNull();
      expect(cashMov!.amount.toFixed(2)).toBe('11900.00');

      // 4. Verificar asiento contable en partida doble
      const entry = await prisma.journalEntry.findFirst({
        where: {
          sourceType: 'CREDIT_NOTE',
          sourceId: nc.id,
        },
        include: {
          lines: {
            include: { account: true },
          },
        },
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('POSTED');

      let totalDebits = 0;
      let totalCredits = 0;
      for (const line of entry!.lines) {
        totalDebits += Number(line.debit);
        totalCredits += Number(line.credit);
      }
      expect(totalDebits).toBeGreaterThan(0);
      expect(totalDebits).toBeCloseTo(totalCredits, 2);

      // Comprobar cuentas específicas en el asiento:
      const codes = entry!.lines.map((l) => l.account.code);
      expect(codes).toContain('417505'); // Devoluciones en Ventas (Débito)
      expect(codes).toContain('240805'); // IVA (Débito compensatorio)
      expect(codes).toContain('110505'); // Caja (Crédito)
      expect(codes).toContain('143501'); // Inventario reintegrado (Débito)
      expect(codes).toContain('613501'); // Reversión Costo de Ventas (Crédito)
    });

    it('rechaza devolución cuando la cantidad supera lo vendido', async () => {
      await setupStandardPucAndMappings();
      const customer = await prisma.customer.create({
        data: { documentType: 'CC', documentNumber: '1112223334', name: 'Cliente Error' },
      });
      const category = await prisma.category.create({ data: { name: 'Genéricos' } });
      const product = await prisma.product.create({
        data: { code: 'PROD-ERR-01', name: 'Ibuprofeno 400mg', basePrice: 5000, baseCost: 2000, categoryId: category.id },
      });
      const sale = await prisma.sale.create({
        data: {
          invoiceNumber: 'FAC-ERR-001',
          customerId: customer.id,
          status: 'CONFIRMED',
          subtotal: 5000,
          taxTotal: 0,
          discountTotal: 0,
          total: 5000,
          paymentMethod: 'EFECTIVO',
          createdById: adminUserId,
        },
      });
      const saleLine = await prisma.saleLine.create({
        data: {
          saleId: sale.id,
          productId: product.id,
          quantityCommercial: 1,
          quantityBaseUnits: 1,
          unitPrice: 5000,
          subtotal: 5000,
          taxRate: 0,
          taxAmount: 0,
          total: 5000,
        },
      });

      await expect(
        creditNotesService.createCreditNote(
          sale.id,
          {
            saleId: sale.id,
            reason: 'Intento de devolver más de lo comprado',
            restock: false,
            items: [{ saleLineId: saleLine.id, quantityCommercial: 5 }],
          },
          adminUserId,
        ),
      ).rejects.toThrow('excede el saldo disponible');
    });
  });

  describe('AUD-002: Anulación de ventas con notas crédito', () => {
    async function confirmCashSaleOfTwoUnits(code: string) {
      await setupStandardPucAndMappings();
      await prisma.customer.create({
        data: {
          documentType: 'CC',
          documentNumber: '222222222222',
          name: 'Consumidor Final',
          isDefault: true,
          isActive: true,
        },
      });
      // Saldo suficiente para que el control de caja no oculte una devolución duplicada
      await prisma.cashMovement.create({
        data: {
          movementType: 'APERTURA',
          amount: new Prisma.Decimal(100000),
          paymentMethod: 'EFECTIVO',
          reason: 'Apertura de caja',
          balanceAfter: new Prisma.Decimal(100000),
          createdByUserId: adminUserId,
        },
      });
      const location = await prisma.location.findFirstOrThrow();
      const category = await prisma.category.create({ data: { name: `Categoría ${code}` } });
      const product = await prisma.product.create({
        data: {
          code,
          name: `Producto ${code}`,
          basePrice: 10000,
          baseCost: 5000,
          categoryId: category.id,
          requiresLotControl: true,
        },
      });
      const presentation = await prisma.productPresentation.create({
        data: {
          productId: product.id,
          name: 'Unidad',
          conversionFactor: 1,
          price: new Prisma.Decimal('10000.00'),
          cost: new Prisma.Decimal('5000.00'),
          isDefault: true,
        },
      });
      const lot = await prisma.inventoryLot.create({
        data: {
          productId: product.id,
          locationId: location.id,
          lotNumber: `LOT-${code}`,
          expirationDate: new Date('2028-12-31'),
          currentQuantity: 10,
          isActive: true,
        },
      });

      const saleRes = await request(app.getHttpServer())
        .post('/api/v1/sales/confirm')
        .set('Idempotency-Key', randomUUID())
        .set('Cookie', cookie)
        .send({
          paymentMethod: 'EFECTIVO',
          items: [{ productId: product.id, presentationId: presentation.id, quantityCommercial: 2 }],
        });
      expect(saleRes.status, JSON.stringify(saleRes.body)).toBe(201);

      const saleLine = await prisma.saleLine.findFirstOrThrow({ where: { saleId: saleRes.body.id } });
      return { saleId: saleRes.body.id as string, saleLineId: saleLine.id, lotId: lot.id };
    }

    function returnOneUnit(saleId: string, saleLineId: string) {
      return creditNotesService.createCreditNote(
        saleId,
        {
          saleId,
          reason: 'Devolución parcial de una unidad',
          restock: true,
          items: [{ saleLineId, quantityCommercial: 1 }],
        },
        adminUserId,
      );
    }

    it('rechaza anular una venta que ya tiene notas crédito sin alterar inventario, caja ni contabilidad', async () => {
      const { saleId, saleLineId, lotId } = await confirmCashSaleOfTwoUnits('PROD-AUD002-A');
      await returnOneUnit(saleId, saleLineId);

      const lotBefore = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } });
      expect(lotBefore.currentQuantity).toBe(9);
      const cashMovementsBefore = await prisma.cashMovement.count();
      const journalEntriesBefore = await prisma.journalEntry.count();
      const statusBefore = (await prisma.sale.findUniqueOrThrow({ where: { id: saleId } })).status;

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/cancel`)
        .set('Cookie', cookie)
        .send({ reason: 'Intento de anular venta con devolución previa' });

      expect(cancelRes.status).toBe(409);
      expect(cancelRes.body.message).toMatch(/nota\(s\) crédito/);
      expect((await prisma.sale.findUniqueOrThrow({ where: { id: saleId } })).status).toBe(statusBefore);
      expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } })).currentQuantity).toBe(9);
      expect(await prisma.cashMovement.count()).toBe(cashMovementsBefore);
      expect(await prisma.journalEntry.count()).toBe(journalEntriesBefore);
    });

    it('anulación y nota crédito simultáneas: solo una se aplica y el inventario no se reintegra dos veces', async () => {
      const { saleId, saleLineId, lotId } = await confirmCashSaleOfTwoUnits('PROD-AUD002-B');

      const [cancelResult, creditNoteResult] = await Promise.allSettled([
        request(app.getHttpServer())
          .post(`/api/v1/sales/${saleId}/cancel`)
          .set('Cookie', cookie)
          .send({ reason: 'Anulación concurrente con devolución' }),
        returnOneUnit(saleId, saleLineId),
      ]);

      expect(cancelResult.status).toBe('fulfilled');
      const cancelStatus = cancelResult.status === 'fulfilled' ? cancelResult.value.status : 0;
      const cancelled = cancelStatus === 200;
      const creditNoteApplied = creditNoteResult.status === 'fulfilled';

      expect(cancelled !== creditNoteApplied).toBe(true);
      const lot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } });
      expect(lot.currentQuantity).toBe(cancelled ? 10 : 9);
      expect(await prisma.creditNote.count({ where: { saleId } })).toBe(creditNoteApplied ? 1 : 0);
    });
  });

  describe('RF-033: Notas Débito (Devoluciones en Compras a Proveedores)', () => {
    it('crea nota débito a proveedor descontando inventario, reduciendo cuenta por pagar y asiento contable balanceado', async () => {
      await setupStandardPucAndMappings();
      const location = await prisma.location.findFirstOrThrow();

      const supplier = await prisma.supplier.create({
        data: {
          taxId: '900987654-1',
          name: 'Laboratorios Farmacéuticos Andinos SAS',
        },
      });

      const category = await prisma.category.create({ data: { name: 'Inyectables' } });
      const product = await prisma.product.create({
        data: {
          code: 'PROD-PUR-01',
          name: 'Diclofenaco 75mg Ampolla',
          basePrice: 8000,
          baseCost: 4000,
          categoryId: category.id,
        },
      });

      const lot = await prisma.inventoryLot.create({
        data: {
          productId: product.id,
          locationId: location.id,
          lotNumber: 'LOT-PUR-01',
          expirationDate: new Date('2029-06-30'),
          currentQuantity: 10,
          isActive: true,
        },
      });

      const purchase = await prisma.purchase.create({
        data: {
          supplierId: supplier.id,
          invoiceNumber: 'FAC-PROV-999',
          status: 'RECEIVED',
          purchaseDate: new Date('2026-10-01'),
          totalAmount: 40000,
          receivedByUserId: adminUserId,
        },
      });

      const purchaseLine = await prisma.purchaseLine.create({
        data: {
          purchaseId: purchase.id,
          productId: product.id,
          lotId: lot.id,
          quantityCommercial: 10,
          quantityBaseUnits: 10,
          unitCost: 4000,
          subtotal: 40000,
          lotNumber: 'LOT-PUR-01',
          expirationDate: new Date('2029-06-30'),
        },
      });

      const payable = await prisma.payable.create({
        data: {
          purchaseId: purchase.id,
          supplierId: supplier.id,
          totalAmount: 40000,
          balance: 40000,
          status: 'PENDIENTE',
          dueDate: new Date('2026-11-01'),
        },
      });

      // Crear Nota Débito por 3 unidades defectuosas
      const nd = await debitNotesService.createDebitNote(
        purchase.id,
        {
          purchaseId: purchase.id,
          reason: 'Ampollas con rotura de empaque primario',
          items: [
            {
              purchaseLineId: purchaseLine.id,
              quantityCommercial: 3,
            },
          ],
        },
        adminUserId,
      );

      expect(nd).toBeDefined();
      expect(nd.debitNoteNumber).toMatch(/^ND-\d{6}$/);
      expect(Number(nd.total)).toBe(12000); // 3 * 4000 = 12000
      expect(Number(nd.subtotal)).toBe(12000);

      // 1. Verificar inventario del lote: debe haber disminuido de 10 a 7
      const reloadedLot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } });
      expect(reloadedLot.currentQuantity).toBe(7);

      // 2. Verificar movimiento en Kardex
      const mov = await prisma.inventoryMovement.findFirst({
        where: {
          referenceDocumentType: 'DEBIT_NOTE',
          lotId: lot.id,
        },
      });
      expect(mov).not.toBeNull();
      expect(mov!.movementType).toBe('SALIDA_DEVOLUCION_COMPRA');
      expect(mov!.quantityBaseUnits).toBe(3);
      expect(mov!.balanceAfterBaseUnits).toBe(7);

      // 3. Verificar cuenta por pagar reducida
      const reloadedPayable = await prisma.payable.findUniqueOrThrow({ where: { id: payable.id } });
      expect(reloadedPayable.balance.toFixed(2)).toBe('28000.00'); // 40000 - 12000 = 28000

      // 4. Verificar asiento contable de Nota Débito
      const entry = await prisma.journalEntry.findFirst({
        where: {
          sourceType: 'DEBIT_NOTE',
          sourceId: nd.id,
        },
        include: {
          lines: {
            include: { account: true },
          },
        },
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('POSTED');

      let totalDebits = 0;
      let totalCredits = 0;
      for (const line of entry!.lines) {
        totalDebits += Number(line.debit);
        totalCredits += Number(line.credit);
      }
      expect(totalDebits).toBeCloseTo(12000, 2);
      expect(totalDebits).toBeCloseTo(totalCredits, 2);

      const codes = entry!.lines.map((l) => l.account.code);
      expect(codes).toContain('220505'); // Proveedores Nacionales (Débito)
      expect(codes).toContain('143501'); // Inventario reducido (Crédito)
    });

    it('bloquea nota débito cuando el inventario del lote es insuficiente para devolver', async () => {
      await setupStandardPucAndMappings();
      const location = await prisma.location.findFirstOrThrow();

      const supplier = await prisma.supplier.create({
        data: { taxId: '900111222-3', name: 'Distribuidor Stock Agotado' },
      });
      const category = await prisma.category.create({ data: { name: 'Pastas' } });
      const product = await prisma.product.create({
        data: { code: 'PROD-NO-STOCK', name: 'Omeprazol 20mg', basePrice: 10000, baseCost: 3000, categoryId: category.id },
      });
      const lot = await prisma.inventoryLot.create({
        data: {
          productId: product.id,
          locationId: location.id,
          lotNumber: 'LOT-EMPTY',
          expirationDate: new Date('2028-12-31'),
          currentQuantity: 1, // Sólo queda 1 en inventario
          isActive: true,
        },
      });
      const purchase = await prisma.purchase.create({
        data: {
          supplierId: supplier.id,
          invoiceNumber: 'FAC-EMPTY-01',
          status: 'RECEIVED',
          purchaseDate: new Date('2026-10-01'),
          totalAmount: 30000,
          receivedByUserId: adminUserId,
        },
      });
      const purchaseLine = await prisma.purchaseLine.create({
        data: {
          purchaseId: purchase.id,
          productId: product.id,
          lotId: lot.id,
          quantityCommercial: 10,
          quantityBaseUnits: 10,
          unitCost: 3000,
          subtotal: 30000,
          lotNumber: 'LOT-EMPTY',
          expirationDate: new Date('2028-12-31'),
        },
      });

      // Intento de devolver 5 unidades cuando sólo queda 1
      await expect(
        debitNotesService.createDebitNote(
          purchase.id,
          {
            purchaseId: purchase.id,
            reason: 'Intento de devolución sin stock disponible',
            items: [{ purchaseLineId: purchaseLine.id, quantityCommercial: 5 }],
          },
          adminUserId,
        ),
      ).rejects.toThrow('Existencias insuficientes en el lote');
    });
  });

  describe('RF-034: Reporte Auxiliar de Terceros / Medios Magnéticos', () => {
    it('genera el reporte de terceros agrupando débitos y créditos con saldo acumulado', async () => {
      await setupStandardPucAndMappings();

      const customer = await prisma.customer.create({
        data: { documentType: 'CC', documentNumber: '1098765432', name: 'Laura Restrepo' },
      });

      const today = new Date().toISOString().slice(0, 10);

      // Crear venta asociada a cliente
      const sale = await prisma.sale.create({
        data: {
          invoiceNumber: 'FAC-REP-01',
          customerId: customer.id,
          status: 'CONFIRMED',
          subtotal: 50000,
          taxTotal: 0,
          discountTotal: 0,
          total: 50000,
          paymentMethod: 'EFECTIVO',
          createdById: adminUserId,
        },
      });

      await journalService.post({
        entryDate: today,
        description: 'Asiento de prueba venta para reporte de terceros',
        sourceType: 'SALE',
        sourceId: sale.id,
        createdById: adminUserId,
        lines: [
          { purpose: 'CASH', debit: '50000.00', credit: '0.00' },
          { purpose: 'SALES_EXCLUDED', debit: '0.00', credit: '50000.00' },
        ],
      });

      // Consultar endpoint del reporte de terceros
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/third-parties')
        .set('Cookie', cookie)
        .query({ fromDate: today, toDate: today });

      expect(res.status).toBe(200);
      expect(res.body.rows).toBeInstanceOf(Array);
      expect(res.body.rows.length).toBeGreaterThan(0);

      const customerRow = res.body.rows.find((r: any) => r.documentNumber === '1098765432');
      expect(customerRow).toBeDefined();
      expect(customerRow.name).toBe('Laura Restrepo');
      expect(Number(customerRow.totalDebit)).toBe(50000);
      expect(Number(customerRow.totalCredit)).toBe(50000);
    });

    it('exporta el reporte de terceros a archivo Excel .xlsx descargable', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .get('/api/v1/accounting/reports/third-parties/export')
        .set('Cookie', cookie)
        .query({ fromDate: today, toDate: today })
        .buffer()
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.headers['content-disposition']).toContain('reporte_terceros_');
      expect(res.body.length).toBeGreaterThan(100);
    });
  });
});
