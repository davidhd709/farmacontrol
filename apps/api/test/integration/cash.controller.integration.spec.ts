import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';
import { seedPurposeMappings } from './support/accounting-fixtures';
import { CashService } from '../../src/modules/cash/application/cash.service';

describe('CashController (Integration with PostgreSQL & RBAC)', () => {
  let counterpartAccountId: string;
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;
  let cashService: CashService;
  let cajeroId: string;

  let cajeroCookie: string;
  let unauthorizedCookie: string;

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
    cashService = moduleFixture.get(CashService);
  }, 30000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    // 1. Permisos para caja
    const permCashRead = await prisma.permission.upsert({
      where: { name: 'cash:read' },
      update: {},
      create: { name: 'cash:read', description: 'Consultar estado y balance de caja' },
    });
    const permCashMov = await prisma.permission.upsert({
      where: { name: 'cash:movements' },
      update: {},
      create: { name: 'cash:movements', description: 'Registrar movimientos de caja' },
    });

    // 2. Rol cajero con permisos de caja
    const cajeroRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: cajeroRole.id, permissionId: permCashRead.id } },
      update: {},
      create: { roleId: cajeroRole.id, permissionId: permCashRead.id },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: cajeroRole.id, permissionId: permCashMov.id } },
      update: {},
      create: { roleId: cajeroRole.id, permissionId: permCashMov.id },
    });

    // 3. Usuario cajero aprovisionado como primer usuario
    const cajeroUser = await provisioningService.provisionInitialUser({
      username: 'cajero_operativo',
      password: 'CajeroPassword#2026',
    });
    cajeroId = cajeroUser.id!;
    await prisma.userRole.create({
      data: {
        userId: cajeroUser.id!,
        roleId: cajeroRole.id,
      },
    });

    // 4. Usuario no autorizado (creado directamente en BD con el mismo hash)
    await prisma.user.create({
      data: {
        username: 'usuario_sin_caja',
        passwordHash: cajeroUser.passwordHash,
        isActive: true,
      },
    });

    // 5. Sesiones
    const cajeroLogin = await authService.login('cajero_operativo', 'CajeroPassword#2026');
    cajeroCookie = `${SESSION_COOKIE_NAME}=${cajeroLogin.rawToken}`;

    const plainLogin = await authService.login('usuario_sin_caja', 'CajeroPassword#2026');
    unauthorizedCookie = `${SESSION_COOKIE_NAME}=${plainLogin.rawToken}`;
    counterpartAccountId = (await seedPurposeMappings()).CAPITAL;
  });

  afterAll(async () => {
    await app.close();
    await cleanTestDatabase();
  });

  // Los movimientos de caja nacen de ventas, recibos de caja y comprobantes de egreso, que
  // los registran con este servicio dentro de su transacción
  const record = (movementType: string, amount: number, reason: string, paymentMethod?: string) =>
    prisma.$transaction((tx) =>
      cashService.recordMovementInTransaction(tx, {
        movementType,
        amount,
        paymentMethod,
        reason,
        createdByUserId: cajeroId,
      }),
    );

  it('consulta el saldo exacto, los movimientos y su orden por fecha', async () => {
    const ingreso = await record('INGRESO_MANUAL', 100000, 'Base de caja inicial de apertura');
    const egreso = await record('EGRESO_MANUAL', 30000, 'Pago de domicilio urgente');

    const resBalance = await request(app.getHttpServer())
      .get('/api/v1/cash-movements/balance')
      .set('Cookie', cajeroCookie)
      .expect(200);
    expect(resBalance.body.currentBalance).toBe(70000);
    expect(resBalance.body.totalIncomeToday).toBe(100000);
    expect(resBalance.body.totalExpenseToday).toBe(30000);
    expect(resBalance.body.movementsCountToday).toBe(2);

    const resList = await request(app.getHttpServer())
      .get('/api/v1/cash-movements')
      .set('Cookie', cajeroCookie)
      .expect(200);
    expect(resList.body.total).toBe(2);
    expect(resList.body.items[0].id).toBe(egreso); // Más reciente primero
    expect(resList.body.items[0].balanceAfter).toBe(70000);

    const resAsc = await request(app.getHttpServer())
      .get('/api/v1/cash-movements?sortOrder=asc')
      .set('Cookie', cajeroCookie)
      .expect(200);
    expect(resAsc.body.items.map((m: { id: string }) => m.id)).toEqual([ingreso, egreso]);
    await request(app.getHttpServer())
      .get('/api/v1/cash-movements?sortOrder=fecha')
      .set('Cookie', cajeroCookie)
      .expect(400);
  });

  it('un egreso que supera el saldo de caja física se rechaza y no deja movimiento', async () => {
    await expect(record('EGRESO_MANUAL', 50000, 'Egreso sin saldo')).rejects.toThrow(/Saldo insuficiente en caja/);
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it('caja solo admite efectivo y conserva la lectura de históricos no efectivos', async () => {
    await expect(record('INGRESO_MANUAL', 10000, 'Intento no efectivo', 'TRANSFERENCIA')).rejects.toThrow(
      /efectivo/i,
    );
    const id = await record('INGRESO_MANUAL', 10000, 'Ingreso físico sin medio explícito');
    const created = await request(app.getHttpServer())
      .get(`/api/v1/cash-movements/${id}`)
      .set('Cookie', cajeroCookie)
      .expect(200);
    expect(created.body.paymentMethod).toBe('EFECTIVO');

    const historical = await prisma.cashMovement.create({
      data: {
        movementType: 'INGRESO_MANUAL',
        amount: '1000.00',
        paymentMethod: 'TRANSFERENCIA',
        reason: 'Histórico anterior a la separación Caja/Bancos',
        balanceAfter: '11000.00',
        createdByUserId: cajeroId,
      },
    });
    const read = await request(app.getHttpServer())
      .get(`/api/v1/cash-movements/${historical.id}`)
      .set('Cookie', cajeroCookie)
      .expect(200);
    expect(read.body.paymentMethod).toBe('TRANSFERENCIA');
  });

  it('caja es de solo consulta: crear un movimiento manual responde 410 y exige permiso', async () => {
    const retired = await request(app.getHttpServer())
      .post('/api/v1/cash-movements')
      .set('Cookie', cajeroCookie)
      .send({ movementType: 'INGRESO_MANUAL', counterpartAccountId, amount: 50000, reason: 'Ingreso manual' })
      .expect(410);
    expect(retired.body.message).toMatch(/fue retirada/);
    expect(await prisma.cashMovement.count()).toBe(0);

    await request(app.getHttpServer())
      .post('/api/v1/cash-movements')
      .set('Cookie', unauthorizedCookie)
      .send({ movementType: 'INGRESO_MANUAL', counterpartAccountId, amount: 50000, reason: 'Intento' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/cash-movements/balance')
      .set('Cookie', unauthorizedCookie)
      .expect(403);
  });
});
