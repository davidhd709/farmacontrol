import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac, Prisma } from '@farmacia/database';
import { RECEIVABLE_STATUSES } from '@farmacia/contracts';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/**
 * FARM-AUD-003: la anulación de una venta a crédito debe dejar su cuenta por cobrar en el estado
 * canónico del contrato (ANULADA), visible y filtrable, sin efectos financieros duplicados.
 */
describe('Estados de cuentas por cobrar tras anular ventas a crédito (FARM-AUD-003)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let cajeroCookie: string;
  let adminCookie: string;
  let customerId: string;
  let productId: string;
  let lotId: string;

  beforeAll(async () => {
    await cleanTestDatabase();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    provisioningService = moduleFixture.get(UserProvisioningService);
    authService = moduleFixture.get(AuthService);
  }, 30000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    const accountingMappings = [
      { purpose: 'CASH', code: '110505', type: 'ASSET' },
      { purpose: 'BANK', code: '111005', type: 'ASSET' },
      { purpose: 'CUSTOMERS', code: '130505', type: 'ASSET' },
      { purpose: 'INVENTORY', code: '143501', type: 'ASSET' },
      { purpose: 'VAT_OUTPUT', code: '240805', type: 'LIABILITY' },
      { purpose: 'SALES_TAXED', code: '413501', type: 'INCOME' },
      { purpose: 'SALES_EXCLUDED', code: '413502', type: 'INCOME' },
      { purpose: 'COST_OF_SALES', code: '613501', type: 'COST' },
    ] as const;
    for (const mapping of accountingMappings) {
      const account = await prisma.account.create({
        data: {
          code: mapping.code,
          name: mapping.purpose,
          type: mapping.type,
          level: 1,
          allowsMovement: true,
          isActive: true,
        },
      });
      await prisma.companyAccountingMapping.create({
        data: {
          purpose: mapping.purpose,
          accountId: account.id,
          status: 'ACTIVE',
          effectiveFrom: new Date('2020-01-01T00:00:00Z'),
        },
      });
    }

    await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final (Cuantías Menores)',
        isDefault: true,
        isActive: true,
      },
    });
    const customer = await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '1030405060',
        name: 'Cliente Crédito Cartera',
        isDefault: false,
        isActive: true,
      },
    });
    customerId = customer.id;

    const category = await prisma.category.create({ data: { name: 'Analgésicos' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'MED-ACE-500',
        name: 'Acetaminofén 500mg',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('1000.00'),
        baseCost: new Prisma.Decimal('600.00'),
        requiresLotControl: true,
      },
    });
    productId = product.id;
    const location = await prisma.location.create({
      data: { code: 'POS-01', name: 'Estante Principal', isDefault: true },
    });
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 180);
    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId: location.id,
        lotNumber: 'LOTE-CARTERA-01',
        expirationDate: expiration,
        currentQuantity: 100,
        isActive: true,
      },
    });
    lotId = lot.id;

    const cajero = await provisioningService.provisionInitialUser({
      username: 'cartera_cajero',
      password: 'CajeroPassword#2026',
    });
    const cajeroRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cajero.id!, roleId: cajeroRole.id } });
    cajeroCookie = `${SESSION_COOKIE_NAME}=${(await authService.login('cartera_cajero', 'CajeroPassword#2026')).rawToken}`;

    const admin = await prisma.user.create({
      data: { username: 'cartera_admin', passwordHash: cajero.passwordHash, isActive: true },
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await authService.login('cartera_admin', 'CajeroPassword#2026')).rawToken}`;
  }, 30000);

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
  });

  async function confirmCreditSale(quantity: number) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', cajeroCookie)
      .send({
        paymentMethod: 'CREDITO',
        customerId,
        items: [{ productId, quantityCommercial: quantity }],
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const receivable = await prisma.receivable.findUniqueOrThrow({
      where: { saleId: res.body.id },
    });
    return { saleId: res.body.id as string, receivableId: receivable.id };
  }

  function cancelSale(saleId: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Cliente desiste de la compra' });
  }

  function pay(receivableId: string, amount: number) {
    return request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivableId}/payments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', randomUUID())
      .send({ amount, paymentMethod: 'EFECTIVO' });
  }

  function listReceivables(query = '') {
    return request(app.getHttpServer())
      .get(`/api/v1/receivables${query}`)
      .set('Cookie', adminCookie);
  }

  async function financialFootprint() {
    return {
      cashMovements: await prisma.cashMovement.count(),
      bankMovements: await prisma.bankMovement.count(),
      inventoryMovements: await prisma.inventoryMovement.count(),
      journalEntries: await prisma.journalEntry.count(),
      receivablePayments: await prisma.receivablePayment.count(),
    };
  }

  describe('anulación de venta a crédito', () => {
    it('Caso 1: deja la cuenta ANULADA, conserva sus importes y no duplica efectos al reintentar', async () => {
      const { saleId, receivableId } = await confirmCreditSale(5);
      const before = await prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } });
      expect(before.status).toBe('PENDIENTE');
      const cashBefore = await prisma.cashMovement.count();

      const res = await cancelSale(saleId);
      expect(res.status, JSON.stringify(res.body)).toBe(200);

      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.status).toBe('CANCELLED');
      const receivable = await prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } });
      expect(receivable.status).toBe('ANULADA');
      expect(receivable.totalAmount.toFixed(2)).toBe(before.totalAmount.toFixed(2));
      expect(receivable.amountPaid.toFixed(2)).toBe(before.amountPaid.toFixed(2));
      expect(receivable.balance.toFixed(2)).toBe(before.balance.toFixed(2));
      expect(receivable.notes).toMatch(/Venta anulada: Cliente desiste de la compra/);
      // Venta a crédito: la anulación no mueve caja; las unidades vuelven al lote original
      expect(await prisma.cashMovement.count()).toBe(cashBefore);
      expect(
        (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } })).currentQuantity,
      ).toBe(100);

      const footprint = await financialFootprint();
      const retry = await cancelSale(saleId);
      expect(retry.status).toBe(400);
      expect(await financialFootprint()).toEqual(footprint);
      expect(
        (await prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } })).status,
      ).toBe('ANULADA');
    });

    it('dos anulaciones simultáneas dejan una sola anulación y la cuenta ANULADA', async () => {
      const { saleId, receivableId } = await confirmCreditSale(3);

      const results = await Promise.all([cancelSale(saleId), cancelSale(saleId)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);

      expect(
        (await prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } })).status,
      ).toBe('ANULADA');
      expect(
        await prisma.inventoryMovement.count({
          where: { referenceDocumentType: 'SALE_CANCEL', movementType: 'DEVOLUCION_CLIENTE' },
        }),
      ).toBe(1);
      expect(
        (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } })).currentQuantity,
      ).toBe(100);
    });

    it('una cuenta ANULADA no admite abonos ni genera movimientos de caja', async () => {
      const { saleId, receivableId } = await confirmCreditSale(2);
      await cancelSale(saleId).expect(200);
      const footprint = await financialFootprint();

      const res = await pay(receivableId, 500);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/ANULADA/);
      expect(await financialFootprint()).toEqual(footprint);
    });
  });

  describe('consulta y filtros', () => {
    it('Caso 2 y 4: el listado devuelve estados del contrato y cada filtro sus registros', async () => {
      const cancelled = await confirmCreditSale(4);
      await cancelSale(cancelled.saleId).expect(200);
      const partial = await confirmCreditSale(10);
      await pay(partial.receivableId, 4000).expect(201);
      const paid = await confirmCreditSale(3);
      await pay(paid.receivableId, 3000).expect(201);

      const all = await listReceivables();
      expect(all.status).toBe(200);
      expect(all.body.data.total).toBe(3);
      for (const item of all.body.data.items) {
        expect(RECEIVABLE_STATUSES).toContain(item.status);
      }

      const idsFor = async (status: string) => {
        const res = await listReceivables(`?status=${status}`);
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        return res.body.data.items.map((i: { id: string }) => i.id);
      };
      expect(await idsFor('ANULADA')).toEqual([cancelled.receivableId]);
      expect(await idsFor('PENDIENTE')).toEqual([partial.receivableId]);
      expect(await idsFor('PAGADA')).toEqual([paid.receivableId]);

      const annulled = (await listReceivables('?status=ANULADA')).body.data.items[0];
      expect(annulled).toMatchObject({
        id: cancelled.receivableId,
        saleId: cancelled.saleId,
        customerId,
        customerName: 'Cliente Crédito Cartera',
        status: 'ANULADA',
        totalAmount: '4000',
        amountPaid: '0',
        balance: '4000',
      });
      expect(annulled.invoiceNumber).toEqual(expect.any(String));
      expect(annulled.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/receivables/${cancelled.receivableId}`)
        .set('Cookie', adminCookie);
      expect(detail.status).toBe(200);
      expect(detail.body.data.status).toBe('ANULADA');
    });

    it('rechaza filtrar por un estado fuera del contrato', async () => {
      await confirmCreditSale(1);

      const res = await listReceivables('?status=CANCELADA');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/status/);
    });

    it('el resumen por edades no cuenta una cuenta ANULADA como deuda pendiente', async () => {
      const cancelled = await confirmCreditSale(4);
      await confirmCreditSale(2);
      await cancelSale(cancelled.saleId).expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/receivables/aging-summary')
        .set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.totalCount).toBe(1);
      expect(res.body.data.totalPending).toBe('2000.00');
    });
  });

  describe('abonos y pagos (sin regresiones)', () => {
    it('Caso 7: un abono parcial deja PENDIENTE y el pago completo deja PAGADA con saldo cero', async () => {
      const { receivableId } = await confirmCreditSale(10);

      const partial = await pay(receivableId, 4000);
      expect(partial.status, JSON.stringify(partial.body)).toBe(201);
      expect(partial.body.data.status).toBe('PENDIENTE');
      expect(partial.body.data.balance).toBe('6000');

      const full = await pay(receivableId, 6000);
      expect(full.status).toBe(201);
      expect(full.body.data.status).toBe('PAGADA');
      expect(full.body.data.balance).toBe('0');
      expect(full.body.data.amountPaid).toBe('10000');
      expect(await prisma.receivablePayment.count({ where: { receivableId } })).toBe(2);
      expect(
        await prisma.cashMovement.count({
          where: { referenceDocumentType: 'RECEIVABLE', referenceDocumentId: receivableId },
        }),
      ).toBe(2);
    });
  });
});
