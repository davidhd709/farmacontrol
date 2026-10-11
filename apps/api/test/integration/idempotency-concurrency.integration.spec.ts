/**
 * Fase 4 — QA de la idempotencia compartida en pagos (PostgreSQL real).
 *
 * Cubre los huecos que no tenían prueba:
 * - dos pagos simultáneos de una cuenta por pagar con la misma clave;
 * - una clave vencida en un abono de cartera se procesa de nuevo;
 * - otro usuario que reutiliza la clave de un pago recibe 409, nunca la respuesta ajena.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('Idempotencia concurrente de pagos (Integration)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let adminCookie: string;
  let secondAdminCookie: string;
  let adminUserId: string;
  let customerId: string;
  let supplierId: string;

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
  }, 60000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    const adminUser = await provisioningService.provisionInitialUser({
      username: 'admin_test',
      password: 'Admin12345!',
    });
    adminUserId = adminUser.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminUserId, roleId: adminRole.id } });

    const secondAdmin = await prisma.user.create({
      data: { username: 'admin_dos', passwordHash: adminUser.passwordHash, isActive: true },
    });
    await prisma.userRole.create({ data: { userId: secondAdmin.id, roleId: adminRole.id } });

    adminCookie = `${SESSION_COOKIE_NAME}=${(await authService.login('admin_test', 'Admin12345!')).rawToken}`;
    secondAdminCookie = `${SESSION_COOKIE_NAME}=${(await authService.login('admin_dos', 'Admin12345!')).rawToken}`;

    // Saldo de caja suficiente para pagar a proveedores en efectivo.
    await prisma.cashMovement.create({
      data: {
        movementType: 'INGRESO_MANUAL',
        amount: '500000',
        paymentMethod: 'EFECTIVO',
        reason: 'Saldo inicial de prueba',
        balanceAfter: '500000',
        createdByUserId: adminUserId,
      },
    });

    customerId = (
      await prisma.customer.create({
        data: { documentType: 'CC', documentNumber: '123456789', name: 'Juan Pérez' },
      })
    ).id;
    supplierId = (
      await prisma.supplier.create({
        data: { taxId: '900123456-7', name: 'Distribuidora ABC S.A.S.' },
      })
    ).id;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  async function createReceivable(invoiceNumber: string) {
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber,
        customerId,
        paymentMethod: 'CREDITO',
        subtotal: '50000',
        total: '50000',
        createdById: adminUserId,
      },
    });
    return prisma.receivable.create({
      data: {
        saleId: sale.id,
        customerId,
        totalAmount: '50000',
        balance: '50000',
        status: 'PENDIENTE',
        dueDate: new Date('2027-06-30'),
      },
    });
  }

  async function createPayable(invoiceNumber: string) {
    const purchase = await prisma.purchase.create({
      data: {
        supplierId,
        invoiceNumber,
        purchaseDate: new Date('2026-09-01'),
        totalAmount: '200000',
        status: 'RECEIVED',
        receivedByUserId: adminUserId,
      },
    });
    return prisma.payable.create({
      data: {
        purchaseId: purchase.id,
        supplierId,
        totalAmount: '200000',
        balance: '200000',
        status: 'PENDIENTE',
        dueDate: new Date('2026-10-31'),
      },
    });
  }

  function payReceivable(id: string, key: string, cookie = adminCookie) {
    return request(app.getHttpServer())
      .post(`/api/v1/receivables/${id}/payments`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({ amount: '10000.00', paymentMethod: 'EFECTIVO' });
  }

  function payPayable(id: string, key: string, cookie = adminCookie) {
    return request(app.getHttpServer())
      .post(`/api/v1/payables/${id}/payments`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({ amount: '50000.00', paymentMethod: 'EFECTIVO' });
  }

  it.each([1, 2, 3])(
    'dos pagos simultáneos de una CxP con la misma clave registran un único pago (ronda %i)',
    async (round) => {
      const payable = await createPayable(`FACT-CONC-${round}`);
      const key = `concurrent-payable-${round}`;

      const [first, second] = await Promise.all([
        payPayable(payable.id, key),
        payPayable(payable.id, key),
      ]);

      expect(first.status, JSON.stringify(first.body)).toBe(201);
      expect(second.status, JSON.stringify(second.body)).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(await prisma.payablePayment.count({ where: { payableId: payable.id } })).toBe(1);
      const updated = await prisma.payable.findUniqueOrThrow({ where: { id: payable.id } });
      expect(updated.balance.toString()).toBe('150000');
      expect(
        await prisma.cashMovement.count({
          where: { referenceDocumentType: 'PAYABLE', referenceDocumentId: payable.id },
        }),
      ).toBe(1);
    },
  );

  it('una clave vencida en un abono de cartera se procesa de nuevo', async () => {
    const receivable = await createReceivable('INV-EXPIRED-KEY');
    const key = 'expired-receivable-key';

    const first = await payReceivable(receivable.id, key);
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    // Mientras la clave está vigente, el reintento devuelve la respuesta guardada.
    const retry = await payReceivable(receivable.id, key);
    expect(retry.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    expect(await prisma.receivablePayment.count({ where: { receivableId: receivable.id } })).toBe(
      1,
    );

    await prisma.idempotencyKey.update({
      where: { key },
      // La base exige expires_at > created_at: se simula una clave de hace dos días.
      data: {
        createdAt: new Date(Date.now() - 2 * 86_400_000),
        expiresAt: new Date(Date.now() - 86_400_000),
      },
    });

    const afterExpiry = await payReceivable(receivable.id, key);
    expect(afterExpiry.status, JSON.stringify(afterExpiry.body)).toBe(201);
    expect(await prisma.receivablePayment.count({ where: { receivableId: receivable.id } })).toBe(
      2,
    );
    const updated = await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } });
    expect(updated.balance.toString()).toBe('30000');
    const stored = await prisma.idempotencyKey.findUniqueOrThrow({ where: { key } });
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('otro usuario que reutiliza la clave de un abono recibe 409 sin la respuesta ajena', async () => {
    const receivable = await createReceivable('INV-CROSS-USER');
    const key = 'cross-user-receivable-key';

    const own = await payReceivable(receivable.id, key);
    expect(own.status, JSON.stringify(own.body)).toBe(201);

    const foreign = await payReceivable(receivable.id, key, secondAdminCookie);
    expect(foreign.status).toBe(409);
    expect(JSON.stringify(foreign.body)).not.toContain(own.body.data.payments[0].id);
    expect(await prisma.receivablePayment.count({ where: { receivableId: receivable.id } })).toBe(
      1,
    );
  });

  it('otro usuario que reutiliza la clave de un pago a proveedor recibe 409', async () => {
    const payable = await createPayable('FACT-CROSS-USER');
    const key = 'cross-user-payable-key';

    expect((await payPayable(payable.id, key)).status).toBe(201);
    const foreign = await payPayable(payable.id, key, secondAdminCookie);
    expect(foreign.status).toBe(409);
    expect(await prisma.payablePayment.count({ where: { payableId: payable.id } })).toBe(1);
  });
});
