import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac, Prisma } from '@farmacia/database';
import type { DbPurpose } from '@farmacia/contracts';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/**
 * AUD-007: notas crédito con montos netos de descuento, reintegro a los lotes originales,
 * reembolso por transferencia en tesorería, cartera sin excedentes perdidos, costo histórico,
 * permiso propio, validación del cuerpo e idempotencia.
 */
describe('Notas crédito (Integration with PostgreSQL) — AUD-007', () => {
  let app: INestApplication;
  let adminCookie: string;
  let cajeroCookie: string;
  let adminId: string;
  let productId: string;
  let presentationId: string;
  let lotEarlyId: string;
  let lotLateId: string;
  let bankAccountId: string;
  let customerId: string;

  beforeAll(async () => {
    await cleanTestDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 45000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    const provisioning = app.get(UserProvisioningService);
    const auth = app.get(AuthService);
    const admin = await provisioning.provisionInitialUser({
      username: 'nc_admin',
      password: 'AdminPassword#2026',
    });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('nc_admin', 'AdminPassword#2026')).rawToken}`;

    const cajero = await prisma.user.create({
      data: { username: 'nc_cajero', passwordHash: admin.passwordHash, isActive: true },
    });
    const cajeroRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cajero.id, roleId: cajeroRole.id } });
    cajeroCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('nc_cajero', 'AdminPassword#2026')).rawToken}`;

    // PUC mínimo con los propósitos que usan ventas y notas crédito
    const accounts: Array<{ code: string; type: any; purpose: DbPurpose }> = [
      { code: '110505', type: 'ASSET', purpose: 'CASH' },
      { code: '111005', type: 'ASSET', purpose: 'BANK' },
      { code: '130505', type: 'ASSET', purpose: 'CUSTOMERS' },
      { code: '143501', type: 'ASSET', purpose: 'INVENTORY' },
      { code: '240805', type: 'LIABILITY', purpose: 'VAT_OUTPUT' },
      { code: '413501', type: 'INCOME', purpose: 'SALES_TAXED' },
      { code: '413502', type: 'INCOME', purpose: 'SALES_EXCLUDED' },
      { code: '417505', type: 'INCOME', purpose: 'SALES_RETURNS' },
      { code: '417510', type: 'INCOME', purpose: 'SALES_DISCOUNTS' },
      { code: '613501', type: 'COST', purpose: 'COST_OF_SALES' },
    ];
    for (const a of accounts) {
      const account = await prisma.account.create({
        data: {
          code: a.code,
          name: `Cuenta ${a.code}`,
          type: a.type,
          level: 1,
          allowsMovement: true,
        },
      });
      await prisma.companyAccountingMapping.create({
        data: {
          purpose: a.purpose,
          accountId: account.id,
          status: 'ACTIVE',
          effectiveFrom: new Date('2020-01-01'),
        },
      });
    }

    await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final',
        isDefault: true,
      },
    });
    const customer = await prisma.customer.create({
      data: { documentType: 'CC', documentNumber: '1067000111', name: 'Ana Cliente' },
    });
    customerId = customer.id;

    await prisma.cashMovement.create({
      data: {
        movementType: 'APERTURA',
        amount: new Prisma.Decimal(500000),
        paymentMethod: 'EFECTIVO',
        reason: 'Apertura de caja',
        balanceAfter: new Prisma.Decimal(500000),
        createdByUserId: adminId,
      },
    });
    const bank = await prisma.bankAccount.create({
      data: {
        bankName: 'Banco Prueba',
        accountType: 'AHORROS',
        accountNumber: 'NC-001',
        name: 'Cuenta ventas',
        createdById: adminId,
      },
    });
    bankAccountId = bank.id;

    const location = await prisma.location.create({
      data: { code: 'NC-01', name: 'Mostrador', isDefault: true },
    });
    const category = await prisma.category.create({ data: { name: 'Antialérgicos' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'LOR-10',
        name: 'Loratadina 10mg',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('1000.00'),
        baseCost: new Prisma.Decimal('500.00'),
        requiresLotControl: true,
      },
    });
    productId = product.id;
    const presentation = await prisma.productPresentation.create({
      data: {
        productId,
        name: 'Tableta',
        conversionFactor: 1,
        price: new Prisma.Decimal('1000.00'),
        cost: new Prisma.Decimal('500.00'),
        isDefault: true,
      },
    });
    presentationId = presentation.id;

    const soon = new Date();
    soon.setDate(soon.getDate() + 60);
    const later = new Date();
    later.setDate(later.getDate() + 300);
    lotEarlyId = (
      await prisma.inventoryLot.create({
        data: {
          productId,
          locationId: location.id,
          lotNumber: 'L-PRONTO',
          expirationDate: soon,
          currentQuantity: 1,
        },
      })
    ).id;
    lotLateId = (
      await prisma.inventoryLot.create({
        data: {
          productId,
          locationId: location.id,
          lotNumber: 'L-TARDE',
          expirationDate: later,
          currentQuantity: 20,
        },
      })
    ).id;
  }, 45000);

  async function sell(body: Record<string, unknown>) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', adminCookie)
      .send({ paymentMethod: 'EFECTIVO', ...body });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const line = await prisma.saleLine.findFirstOrThrow({ where: { saleId: res.body.id } });
    return { saleId: res.body.id as string, saleLineId: line.id };
  }

  function creditNote(
    saleId: string,
    body: Record<string, unknown>,
    opts: { key?: string | null; cookie?: string } = {},
  ) {
    const req = request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/credit-notes`)
      .set('Cookie', opts.cookie ?? adminCookie);
    if (opts.key !== null) req.set('Idempotency-Key', opts.key ?? randomUUID());
    return req.send({ reason: 'Devolución de prueba', ...body });
  }

  const item = (saleLineId: string, quantityCommercial: number) => [
    { saleLineId, quantityCommercial },
  ];

  it('devuelve el valor neto del descuento y, al completar la línea, exactamente lo cobrado', async () => {
    // 3 × 1 000 − 100 de descuento = 2 900
    const { saleId, saleLineId } = await sell({
      items: [{ productId, presentationId, quantityCommercial: 3, discount: 100 }],
    });

    const first = await creditNote(saleId, {
      refundMethod: 'EFECTIVO',
      items: item(saleLineId, 1),
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.total).toBe(966.67);

    const rest = await creditNote(saleId, { refundMethod: 'EFECTIVO', items: item(saleLineId, 2) });
    expect(rest.status).toBe(201);
    expect(rest.body.total).toBe(1933.33);

    const refunded = await prisma.cashMovement.aggregate({
      where: { referenceDocumentType: 'CREDIT_NOTE' },
      _sum: { amount: true },
    });
    expect(refunded._sum.amount?.toFixed(2)).toBe('2900.00');
  });

  it('reintegra a cada lote de origen lo que salió de él', async () => {
    // FEFO: 1 del lote próximo a vencer y 2 del lote tardío
    const { saleId, saleLineId } = await sell({
      items: [{ productId, presentationId, quantityCommercial: 3 }],
    });
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotEarlyId } })).currentQuantity,
    ).toBe(0);

    const res = await creditNote(saleId, { refundMethod: 'EFECTIVO', items: item(saleLineId, 3) });
    expect(res.status).toBe(201);
    expect(res.body.lines).toHaveLength(2);

    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotEarlyId } })).currentQuantity,
    ).toBe(1);
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotLateId } })).currentQuantity,
    ).toBe(20);
    const qty = res.body.lines.reduce((a: number, l: any) => a + l.quantityCommercial, 0);
    expect(qty).toBe(3);
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        referenceDocumentType: 'CREDIT_NOTE',
        referenceDocumentId: res.body.creditNoteNumber,
      },
    });
    expect(movements.map((m) => m.quantityBaseUnits).sort()).toEqual([1, 2]);
  });

  it('un reembolso por transferencia registra el retiro en la cuenta bancaria de la venta', async () => {
    await prisma.bankAccount.update({ where: { id: bankAccountId }, data: { currentBalance: 0 } });
    const { saleId, saleLineId } = await sell({
      paymentMethod: 'TRANSFERENCIA',
      bankAccountId,
      amountPaid: 2000,
      items: [{ productId, presentationId, quantityCommercial: 2 }],
    });
    expect(
      (
        await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId } })
      ).currentBalance.toFixed(2),
    ).toBe('2000.00');

    const res = await creditNote(saleId, {
      refundMethod: 'TRANSFERENCIA',
      items: item(saleLineId, 1),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    expect(
      (
        await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId } })
      ).currentBalance.toFixed(2),
    ).toBe('1000.00');
    const bankMovement = await prisma.bankMovement.findFirst({
      where: {
        referenceDocumentType: 'CREDIT_NOTE',
        referenceDocumentId: res.body.creditNoteNumber,
      },
    });
    expect(bankMovement?.movementType).toBe('WITHDRAWAL');
  });

  it('en cartera reduce total y saldo, y rechaza devolver más de lo que el cliente aún debe', async () => {
    const { saleId, saleLineId } = await sell({
      paymentMethod: 'CREDITO',
      customerId,
      items: [{ productId, presentationId, quantityCommercial: 4 }],
    });
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { saleId } });
    const pay = await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivable.id}/payments`)
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', adminCookie)
      .send({ amount: 2500, paymentMethod: 'EFECTIVO' });
    expect(pay.status).toBe(201);

    // Debe 1 500; devolver 2 unidades (2 000) dejaría 500 pagados de más
    const tooMuch = await creditNote(saleId, {
      refundMethod: 'CREDITO_CARTERA',
      items: item(saleLineId, 2),
    });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.message).toContain('supera lo que el cliente aún debe');
    expect(await prisma.creditNote.count()).toBe(0);
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotLateId } })).currentQuantity,
    ).toBe(17);

    const ok = await creditNote(saleId, {
      refundMethod: 'CREDITO_CARTERA',
      items: item(saleLineId, 1),
    });
    expect(ok.status).toBe(201);
    const after = await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } });
    expect(after.totalAmount.toFixed(2)).toBe('3000.00');
    expect(after.amountPaid.toFixed(2)).toBe('2500.00');
    expect(after.balance.toFixed(2)).toBe('500.00');
  });

  it('revierte el costo de venta con el costo vigente al vender, no con el actual', async () => {
    const { saleId, saleLineId } = await sell({
      items: [{ productId, presentationId, quantityCommercial: 2 }],
    });
    await prisma.product.update({
      where: { id: productId },
      data: { baseCost: new Prisma.Decimal('800.00') },
    });

    const res = await creditNote(saleId, { refundMethod: 'EFECTIVO', items: item(saleLineId, 1) });
    expect(res.status).toBe(201);

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { sourceType: 'CREDIT_NOTE', sourceId: res.body.id },
      include: { lines: { include: { account: true } } },
    });
    const costLine = entry.lines.find((l) => l.account.code === '613501');
    expect(costLine?.credit.toFixed(2)).toBe('500.00');
  });

  it('exige el permiso de notas crédito: el cajero recibe 403', async () => {
    const { saleId, saleLineId } = await sell({
      items: [{ productId, presentationId, quantityCommercial: 1 }],
    });
    const res = await creditNote(saleId, { items: item(saleLineId, 1) }, { cookie: cajeroCookie });
    expect(res.status).toBe(403);
  });

  it('valida el cuerpo y rechaza formas de reembolso sin contrapartida', async () => {
    const { saleId, saleLineId } = await sell({
      items: [{ productId, presentationId, quantityCommercial: 1 }],
    });
    expect((await creditNote(saleId, { items: item(saleLineId, -1) })).status).toBe(400);
    expect(
      (await creditNote(saleId, { items: [{ saleLineId, quantityCommercial: '1' }] })).status,
    ).toBe(400);
    expect((await creditNote(saleId, { reason: '', items: item(saleLineId, 1) })).status).toBe(400);
    expect(
      (await creditNote(saleId, { refundMethod: 'SALDO_A_FAVOR', items: item(saleLineId, 1) }))
        .status,
    ).toBe(400);
    expect(
      (await creditNote(saleId, { refundMethod: 'CREDITO_CARTERA', items: item(saleLineId, 1) }))
        .status,
    ).toBe(400);
    expect(await prisma.creditNote.count()).toBe(0);
  });

  it('es idempotente: reintentar con la misma clave no devuelve dos veces el dinero ni el inventario', async () => {
    const { saleId, saleLineId } = await sell({
      items: [{ productId, presentationId, quantityCommercial: 2 }],
    });
    const key = randomUUID();
    const body = { refundMethod: 'EFECTIVO', items: item(saleLineId, 1) };

    const [a, b] = await Promise.all([
      creditNote(saleId, body, { key }),
      creditNote(saleId, body, { key }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.creditNote.count()).toBe(1);
    expect(
      await prisma.cashMovement.count({ where: { referenceDocumentType: 'CREDIT_NOTE' } }),
    ).toBe(1);

    const missing = await creditNote(saleId, body, { key: null });
    expect(missing.status).toBe(400);
  });
});
