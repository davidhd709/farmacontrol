import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma, Prisma, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/**
 * Recibos de caja y comprobantes de egreso (acuerdo del 4 de octubre): cada movimiento de
 * caja o banco genera su documento con consecutivo en la misma transacción.
 */
describe('Recibos de caja y comprobantes de egreso', () => {
  let app: INestApplication;
  let adminCookie: string;
  let cashierCookie: string;
  let userId: string;
  let bankId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    const provisioning = module.get(UserProvisioningService);
    const auth = module.get(AuthService);
    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await provisioning.provisionInitialUser({ username: 'contadora_rc', password: 'AdminPassword#2026' });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('contadora_rc', 'AdminPassword#2026')).rawToken}`;
    const cashier = await prisma.user.create({ data: { username: 'cajero_rc', passwordHash: admin.passwordHash } });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('cajero_rc', 'AdminPassword#2026')).rawToken}`;
    userId = admin.id!;
  }, 45000);

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "treasury_documents", "cash_movements", "bank_movements", "bank_accounts", "expenses", "expense_categories", "accounts" CASCADE`;
    await prisma.$executeRaw`UPDATE "treasury_document_sequences" SET "last_value" = 0`;
    bankId = (
      await prisma.bankAccount.create({
        data: { bankName: 'Bancolombia', accountType: 'AHORROS', accountNumber: '680958', name: 'Recaudos', createdById: userId },
      })
    ).id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const cash = (movementType: string, amount: string, extra: Partial<Prisma.CashMovementUncheckedCreateInput> = {}, client: Prisma.TransactionClient | typeof prisma = prisma) =>
    client.cashMovement.create({
      data: {
        movementType,
        amount: new Prisma.Decimal(amount),
        paymentMethod: 'EFECTIVO',
        reason: `Movimiento ${movementType}`,
        balanceAfter: new Prisma.Decimal('0'),
        createdByUserId: userId,
        ...extra,
      },
    });

  const bank = (movementType: string, amount: string, extra: Partial<Prisma.BankMovementUncheckedCreateInput> = {}) =>
    prisma.bankMovement.create({
      data: {
        bankAccountId: bankId,
        movementType,
        amount: new Prisma.Decimal(amount),
        balanceBefore: new Prisma.Decimal('0'),
        balanceAfter: new Prisma.Decimal('0'),
        concept: `Banco ${movementType}`,
        createdById: userId,
        ...extra,
      },
    });

  it('cada entrada genera un recibo de caja y cada salida un comprobante de egreso, con consecutivo propio', async () => {
    const venta = await cash('INGRESO_VENTA', '28000.00', { referenceDocumentType: 'SALE', referenceDocumentId: 'FAC-000010' });
    await cash('EGRESO_MANUAL', '185000.00', { reason: 'Pago energía' });
    await cash('INGRESO_MANUAL', '50000.00');
    const transferencia = await bank('DEPOSIT', '90000.00');
    await bank('FEE', '3500.00');
    await bank('WITHDRAWAL', '40000.00');

    const docs = await prisma.treasuryDocument.findMany({ orderBy: { createdAt: 'asc' } });
    expect(docs.map((d) => d.documentNumber)).toEqual([
      'RC-000001', 'CE-000001', 'RC-000002', 'RC-000003', 'CE-000002', 'CE-000003',
    ]);
    const rcVenta = docs.find((d) => d.cashMovementId === venta.id)!;
    expect(rcVenta.documentType).toBe('RECIBO_CAJA');
    expect(rcVenta.amount.toFixed(2)).toBe('28000.00');
    expect(rcVenta.referenceDocumentId).toBe('FAC-000010');
    const rcBanco = docs.find((d) => d.bankMovementId === transferencia.id)!;
    expect(rcBanco.bankAccountId).toBe(bankId);
    expect(rcBanco.paymentMethod).toBe('TRANSFERENCIA');
  });

  it('el saldo de apertura de una cuenta bancaria no genera recibo', async () => {
    await bank('DEPOSIT', '1000000.00', { referenceDocumentType: 'INITIAL_BALANCE' });
    expect(await prisma.treasuryDocument.count()).toBe(0);
  });

  it('un movimiento revertido no consume número: no quedan huecos', async () => {
    await cash('INGRESO_VENTA', '1000.00');
    await expect(
      prisma.$transaction(async (tx) => {
        await cash('INGRESO_VENTA', '2000.00', {}, tx);
        throw new Error('La venta falló después de registrar el dinero');
      }),
    ).rejects.toThrow(/falló/);
    await cash('INGRESO_VENTA', '3000.00');

    const numbers = (await prisma.treasuryDocument.findMany({ orderBy: { createdAt: 'asc' } })).map((d) => d.documentNumber);
    expect(numbers).toEqual(['RC-000001', 'RC-000002']);
  });

  it('movimientos simultáneos reciben números distintos y consecutivos', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => cash('INGRESO_VENTA', `${1000 + i}.00`)));
    const numbers = (await prisma.treasuryDocument.findMany()).map((d) => d.documentNumber).sort();
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => `RC-${String(i + 1).padStart(6, '0')}`));
  });

  it('los documentos emitidos son inmutables', async () => {
    await cash('INGRESO_VENTA', '1000.00');
    const doc = await prisma.treasuryDocument.findFirstOrThrow();
    await expect(
      prisma.treasuryDocument.update({ where: { id: doc.id }, data: { concept: 'otro' } }),
    ).rejects.toThrow(/inmutable/);
    await expect(prisma.treasuryDocument.delete({ where: { id: doc.id } })).rejects.toThrow(/inmutable/);
  });

  it('la API lista por tipo, identifica al tercero y exige permiso contable', async () => {
    const account = await prisma.account.create({
      data: { code: '513525', name: 'ENERGIA', type: 'EXPENSE', level: 1, allowsMovement: true },
    });
    const category = await prisma.expenseCategory.create({ data: { name: 'Servicios', accountId: account.id } });
    const expense = await prisma.expense.create({
      data: {
        categoryId: category.id,
        description: 'Energía septiembre',
        beneficiary: 'Air-e S.A. E.S.P.',
        amount: new Prisma.Decimal('185000'),
        balance: new Prisma.Decimal('0'),
        amountPaid: new Prisma.Decimal('185000'),
        expenseDate: new Date('2026-10-01'),
        paymentMethod: 'EFECTIVO',
        status: 'PAGADO',
        createdById: userId,
      },
    });
    await cash('EGRESO_MANUAL', '185000.00', { reason: 'Pago energía', referenceDocumentType: 'EXPENSE', referenceDocumentId: expense.id });
    await cash('INGRESO_VENTA', '5000.00');

    const res = await request(app.getHttpServer())
      .get('/api/v1/treasury/documents?type=COMPROBANTE_EGRESO')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      documentNumber: 'CE-000001',
      source: 'CAJA',
      amount: '185000.00',
      thirdPartyName: 'Air-e S.A. E.S.P.',
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/treasury/documents/${res.body.items[0].id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(detail.body.documentNumber).toBe('CE-000001');

    await request(app.getHttpServer()).get('/api/v1/treasury/documents?type=OTRO').set('Cookie', adminCookie).expect(400);
    await request(app.getHttpServer()).get('/api/v1/treasury/documents').set('Cookie', cashierCookie).expect(403);
  });
});
