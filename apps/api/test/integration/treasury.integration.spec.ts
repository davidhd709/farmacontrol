import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { cleanTestDatabase, prisma, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('Treasury & Bank Accounts (Slice 11.4 Integration with PostgreSQL)', () => {
  let app: INestApplication;
  let adminCookie: string;
  let cashierCookie: string;
  let supervisorCookie: string;

  beforeAll(async () => {
    await cleanTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 30000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    const provisioning = app.get(UserProvisioningService);
    const auth = app.get(AuthService);

    // Usuario Admin
    const admin = await provisioning.provisionInitialUser({
      username: 'treasury_admin',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('treasury_admin', 'AdminPassword#2026')).rawToken}`;

    // Usuario Supervisor
    const supervisor = await prisma.user.create({
      data: { username: 'treasury_sup', passwordHash: admin.passwordHash },
    });
    const supervisorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'supervisor' } });
    await prisma.userRole.create({ data: { userId: supervisor.id, roleId: supervisorRole.id } });
    supervisorCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('treasury_sup', 'AdminPassword#2026')).rawToken}`;

    // Usuario Cajero
    const cashier = await prisma.user.create({
      data: { username: 'treasury_cashier', passwordHash: admin.passwordHash },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('treasury_cashier', 'AdminPassword#2026')).rawToken}`;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 30000);

  const root = '/api/v1/treasury/bank-accounts';

  it('rechaza 401 si no hay sesión autenticada', async () => {
    const res = await request(app.getHttpServer()).get(root);
    expect(res.status).toBe(401);
  });

  it('deniega 403 Forbidden a un cajero al intentar gestionar o consultar cuentas bancarias', async () => {
    const resGet = await request(app.getHttpServer())
      .get(root)
      .set('Cookie', cashierCookie);
    expect(resGet.status).toBe(403);

    const resPost = await request(app.getHttpServer())
      .post(root)
      .set('Cookie', cashierCookie)
      .send({
        bankName: 'Bancolombia',
        accountType: 'AHORROS',
        accountNumber: '1234567890',
        name: 'Cuenta Operativa',
      });
    expect(resPost.status).toBe(403);
  });

  it('permite a un administrador crear una cuenta bancaria y registra el movimiento de apertura si hay saldo inicial', async () => {
    const res = await request(app.getHttpServer())
      .post(root)
      .set('Cookie', adminCookie)
      .send({
        bankName: 'Bancolombia',
        accountType: 'AHORROS',
        accountNumber: '9876543210',
        name: 'Cuenta Recaudos Principal',
        initialBalance: '500000.00',
        notes: 'Cuenta para transferencias PSE y QR',
      });

    expect(res.status).toBe(201);
    expect(res.body.bankName).toBe('Bancolombia');
    expect(res.body.accountNumber).toBe('9876543210');
    expect(res.body.initialBalance).toBe('500000.00');
    expect(res.body.currentBalance).toBe('500000.00');
    expect(res.body.isActive).toBe(true);

    // Verificamos que se creó el movimiento inicial
    const movementsRes = await request(app.getHttpServer())
      .get(`${root}/${res.body.id}/movements`)
      .set('Cookie', adminCookie);

    expect(movementsRes.status).toBe(200);
    expect(movementsRes.body.total).toBe(1);
    expect(movementsRes.body.items[0].movementType).toBe('DEPOSIT');
    expect(movementsRes.body.items[0].amount).toBe('500000.00');
    expect(movementsRes.body.items[0].balanceAfter).toBe('500000.00');

    // Verificamos auditoría en PostgreSQL
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'treasury:bank_account_created', entityId: res.body.id },
    });
    expect(audit).not.toBeNull();
  });

  it('rechaza con 409 Conflict si se intenta registrar una cuenta bancaria duplicada', async () => {
    const body = {
      bankName: 'Davivienda',
      accountType: 'CORRIENTE',
      accountNumber: '1122334455',
      name: 'Cuenta Corriente Proveedores',
    };

    const first = await request(app.getHttpServer())
      .post(root)
      .set('Cookie', adminCookie)
      .send(body);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(root)
      .set('Cookie', adminCookie)
      .send(body);
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/Ya existe una cuenta bancaria/);
  });

  it('permite registrar depósitos y retiros manteniendo la consistencia de saldos', async () => {
    // 1. Crear cuenta con saldo inicial 100.000
    const acc = await request(app.getHttpServer())
      .post(root)
      .set('Cookie', adminCookie)
      .send({
        bankName: 'Nequi',
        accountType: 'DIGITAL',
        accountNumber: '3001234567',
        name: 'Bolsillo Nequi Farmacia',
        initialBalance: '100000.00',
      });
    expect(acc.status).toBe(201);
    const accountId = acc.body.id;

    // 2. Registrar depósito por transferencia de cliente (+50.000)
    const dep = await request(app.getHttpServer())
      .post(`${root}/${accountId}/movements`)
      .set('Cookie', adminCookie)
      .send({
        movementType: 'TRANSFER_IN',
        amount: '50000.00',
        concept: 'Transferencia cliente factura F-001',
        externalReference: 'TRX-998877',
      });
    expect(dep.status).toBe(201);
    expect(dep.body.balanceBefore).toBe('100000.00');
    expect(dep.body.balanceAfter).toBe('150000.00');

    // 3. Registrar retiro autorizado (-30.000)
    const withdr = await request(app.getHttpServer())
      .post(`${root}/${accountId}/movements`)
      .set('Cookie', adminCookie)
      .send({
        movementType: 'WITHDRAWAL',
        amount: '30000.00',
        concept: 'Retiro cajero para fondo de caja menor',
      });
    expect(withdr.status).toBe(201);
    expect(withdr.body.balanceBefore).toBe('150000.00');
    expect(withdr.body.balanceAfter).toBe('120000.00');

    // 4. Intentar retiro que supere el saldo disponible (150.000 > 120.000)
    const overdraft = await request(app.getHttpServer())
      .post(`${root}/${accountId}/movements`)
      .set('Cookie', adminCookie)
      .send({
        movementType: 'WITHDRAWAL',
        amount: '150000.00',
        concept: 'Retiro excesivo',
      });
    expect(overdraft.status).toBe(400);
    expect(overdraft.body.message).toMatch(/Fondos insuficientes/);

    // 5. Verificar saldo final en la cuenta
    const getAcc = await request(app.getHttpServer())
      .get(`${root}/${accountId}`)
      .set('Cookie', adminCookie);
    expect(getAcc.body.currentBalance).toBe('120000.00');
  });

  it('procesa múltiples movimientos concurrentes sin inconsistencias en el saldo', async () => {
    const acc = await request(app.getHttpServer())
      .post(root)
      .set('Cookie', adminCookie)
      .send({
        bankName: 'Bancolombia',
        accountType: 'AHORROS',
        accountNumber: '4455667788',
        name: 'Cuenta Concurrencia',
        initialBalance: '0.00',
      });
    const accountId = acc.body.id;

    // Disparamos 5 depósitos simultáneos de 10.000 cada uno
    const promises = Array.from({ length: 5 }).map((_, i) =>
      request(app.getHttpServer())
        .post(`${root}/${accountId}/movements`)
        .set('Cookie', adminCookie)
        .send({
          movementType: 'DEPOSIT',
          amount: '10000.00',
          concept: `Depósito concurrente #${i + 1}`,
        }),
    );

    const results = await Promise.all(promises);
    for (const res of results) {
      expect(res.status).toBe(201);
    }

    const finalAcc = await request(app.getHttpServer())
      .get(`${root}/${accountId}`)
      .set('Cookie', adminCookie);

    // El saldo exacto debe ser 50.000.00
    expect(finalAcc.body.currentBalance).toBe('50000.00');
  });

  it('retorna el resumen global de tesorería con saldos acumulados', async () => {
    await request(app.getHttpServer())
      .post(root)
      .set('Cookie', adminCookie)
      .send({
        bankName: 'Banco 1',
        accountType: 'AHORROS',
        accountNumber: '111',
        name: 'C1',
        initialBalance: '200000.00',
      });

    await request(app.getHttpServer())
      .post(root)
      .set('Cookie', adminCookie)
      .send({
        bankName: 'Banco 2',
        accountType: 'CORRIENTE',
        accountNumber: '222',
        name: 'C2',
        initialBalance: '350000.00',
      });

    const summary = await request(app.getHttpServer())
      .get(`${root}/summary`)
      .set('Cookie', supervisorCookie);

    expect(summary.status).toBe(200);
    expect(summary.body.activeAccountsCount).toBe(2);
    expect(summary.body.totalBalance).toBe('550000.00');
  });
});
