import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';
import { seedPurposeMappings } from './support/accounting-fixtures';

/**
 * Correcciones del cliente, fase 2: la venta a crédito abre la cartera sin mover caja, la
 * devolución reduce la cartera y reingresa el lote, "Ver abonos" muestra todos los
 * movimientos con su saldo y un cambio de producto queda vinculado a la devolución.
 */
describe('Ventas a crédito, devoluciones y cambio de producto', () => {
  let app: INestApplication;
  let provisioning: UserProvisioningService;
  let auth: AuthService;
  let adminCookie: string;
  let customerId: string;
  let otherCustomerId: string;
  let productId: string;
  let lotId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    provisioning = module.get(UserProvisioningService);
    auth = module.get(AuthService);
  }, 30000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
    await seedPurposeMappings();

    await prisma.customer.create({
      data: { documentType: 'CC', documentNumber: '222222222222', name: 'Consumidor Final', isDefault: true },
    });
    customerId = (
      await prisma.customer.create({
        data: { documentType: 'CC', documentNumber: '1030405060', name: 'Marta Crédito' },
      })
    ).id;
    otherCustomerId = (
      await prisma.customer.create({
        data: { documentType: 'CC', documentNumber: '1030405061', name: 'Otro Cliente' },
      })
    ).id;
    const category = await prisma.category.create({ data: { name: 'Analgésicos' } });
    productId = (
      await prisma.product.create({
        data: {
          inventoryControlMode: 'LOT_EXPIRY',
          categoryId: category.id,
          code: 'MED-ACE-500',
          name: 'Acetaminofén 500mg',
          baseUnit: 'TABLETA',
          basePrice: new Prisma.Decimal('1000.00'),
          baseCost: new Prisma.Decimal('600.00'),
        },
      })
    ).id;
    const location = await prisma.location.create({
      data: { code: 'POS-01', name: 'Estante Principal', isDefault: true },
    });
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 180);
    lotId = (
      await prisma.inventoryLot.create({
        data: {
          controlMode: 'LOT_EXPIRY',
          productId,
          locationId: location.id,
          lotNumber: 'LOTE-CR-01',
          expirationDate: expiration,
          currentQuantity: 100,
          isActive: true,
        },
      })
    ).id;

    const admin = await provisioning.provisionInitialUser({
      username: 'cartera_admin',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('cartera_admin', 'AdminPassword#2026')).rawToken}`;
  }, 30000);

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
  });

  const sell = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', adminCookie)
      .send({ items: [{ productId, quantityCommercial: 10 }], ...body });

  const movements = (receivableId: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/receivables/${receivableId}/movements`)
      .set('Cookie', adminCookie);

  it('la venta a crédito exige un cliente identificado', async () => {
    const withoutCustomer = await sell({ paymentMethod: 'CREDITO' });
    expect(withoutCustomer.status).toBe(400);
    expect(withoutCustomer.body.message).toMatch(/cliente identificado/);
    expect(await prisma.sale.count()).toBe(0);
  });

  it('crea la cartera sin ingreso de caja y "Ver abonos" refleja abonos, devoluciones y saldo', async () => {
    const sale = await sell({ paymentMethod: 'CREDITO', customerId });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.bankMovement.count()).toBe(0);
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { saleId: sale.body.id } });
    expect(receivable.balance.toFixed(2)).toBe('10000.00');

    await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivable.id}/payments`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: 4000, paymentMethod: 'EFECTIVO' })
      .expect(201);

    // Devolución parcial: 2 tabletas vuelven al lote de origen y bajan la cartera
    const note = await request(app.getHttpServer())
      .post(`/api/v1/sales/${sale.body.id}/credit-notes`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        saleId: sale.body.id,
        reason: 'Cliente desiste de dos tabletas',
        refundMethod: 'CREDITO_CARTERA',
        restock: true,
        items: [{ saleLineId: sale.body.lines[0].id, quantityCommercial: 2 }],
      });
    expect(note.status, JSON.stringify(note.body)).toBe(201);
    expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } })).currentQuantity).toBe(92);

    const res = await movements(receivable.id).expect(200);
    expect(res.body.data.balance).toBe('4000.00');
    expect(
      res.body.data.movements.map((m: { type: string; charge: string; credit: string; balance: string }) => [
        m.type,
        m.charge,
        m.credit,
        m.balance,
      ]),
    ).toEqual([
      ['CARGO', '10000.00', '0.00', '10000.00'],
      ['ABONO', '0.00', '4000.00', '6000.00'],
      ['NOTA_CREDITO', '0.00', '2000.00', '4000.00'],
    ]);
    expect(res.body.data.movements[0].documentNumber).toBe(sale.body.invoiceNumber);
    expect(res.body.data.movements[2].documentNumber).toBe(note.body.creditNoteNumber);
  });

  it('el cambio de producto vincula la venta nueva a la devolución, una sola vez y al mismo cliente', async () => {
    const original = await sell({ paymentMethod: 'EFECTIVO', amountPaid: 10000, customerId });
    expect(original.status, JSON.stringify(original.body)).toBe(201);
    const note = await request(app.getHttpServer())
      .post(`/api/v1/sales/${original.body.id}/credit-notes`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        saleId: original.body.id,
        reason: 'Cambio por otra presentación',
        refundMethod: 'EFECTIVO',
        items: [{ saleLineId: original.body.lines[0].id, quantityCommercial: 10 }],
      });
    expect(note.status, JSON.stringify(note.body)).toBe(201);

    const otherCustomer = await sell({
      paymentMethod: 'EFECTIVO',
      amountPaid: 5000,
      customerId: otherCustomerId,
      exchangeCreditNoteId: note.body.id,
      items: [{ productId, quantityCommercial: 5 }],
    });
    expect(otherCustomer.status).toBe(400);

    const exchange = await sell({
      paymentMethod: 'EFECTIVO',
      amountPaid: 5000,
      customerId,
      exchangeCreditNoteId: note.body.id,
      items: [{ productId, quantityCommercial: 5 }],
    });
    expect(exchange.status, JSON.stringify(exchange.body)).toBe(201);

    const linked = await request(app.getHttpServer())
      .get(`/api/v1/credit-notes/${note.body.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(linked.body.exchangeSaleId).toBe(exchange.body.id);
    expect(linked.body.exchangeSaleInvoiceNumber).toBe(exchange.body.invoiceNumber);

    const again = await sell({
      paymentMethod: 'EFECTIVO',
      amountPaid: 1000,
      customerId,
      exchangeCreditNoteId: note.body.id,
      items: [{ productId, quantityCommercial: 1 }],
    });
    expect(again.status).toBe(409);
  });
});
