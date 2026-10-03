import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('CashController (Integration with PostgreSQL & RBAC)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

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
  });

  afterAll(async () => {
    await app.close();
    await cleanTestDatabase();
  });

  it('permite registrar ingresos y egresos manteniendo el cálculo exacto de saldo en caja', async () => {
    // 1. Ingreso de base de efectivo por $100.000
    const resIngreso = await request(app.getHttpServer())
      .post('/api/v1/cash-movements')
      .set('Cookie', cajeroCookie)
      .send({
        movementType: 'INGRESO_MANUAL',
        amount: 100000,
        paymentMethod: 'EFECTIVO',
        reason: 'Base de caja inicial de apertura',
      })
      .expect(201);

    expect(resIngreso.body.id).toBeDefined();
    expect(resIngreso.body.amount).toBe(100000);
    expect(resIngreso.body.balanceAfter).toBe(100000);
    expect(resIngreso.body.movementType).toBe('INGRESO_MANUAL');

    // 2. Egreso por pago menor de mensajería por $30.000
    const resEgreso = await request(app.getHttpServer())
      .post('/api/v1/cash-movements')
      .set('Cookie', cajeroCookie)
      .send({
        movementType: 'EGRESO_MANUAL',
        amount: 30000,
        paymentMethod: 'EFECTIVO',
        reason: 'Pago de domicilio urgente',
      })
      .expect(201);

    expect(resEgreso.body.id).toBeDefined();
    expect(resEgreso.body.amount).toBe(30000);
    expect(resEgreso.body.balanceAfter).toBe(70000);

    // 3. Consultar balance
    const resBalance = await request(app.getHttpServer())
      .get('/api/v1/cash-movements/balance')
      .set('Cookie', cajeroCookie)
      .expect(200);

    expect(resBalance.body.currentBalance).toBe(70000);
    expect(resBalance.body.totalIncomeToday).toBe(100000);
    expect(resBalance.body.totalExpenseToday).toBe(30000);
    expect(resBalance.body.movementsCountToday).toBe(2);

    // 4. Consultar listado de movimientos
    const resList = await request(app.getHttpServer())
      .get('/api/v1/cash-movements')
      .set('Cookie', cajeroCookie)
      .expect(200);

    expect(resList.body.items).toHaveLength(2);
    expect(resList.body.total).toBe(2);
    expect(resList.body.items[0].id).toBe(resEgreso.body.id); // Más reciente primero
  });

  it('rechaza un egreso si supera el saldo disponible en caja física', async () => {
    // Caja inicia en $0
    const res = await request(app.getHttpServer())
      .post('/api/v1/cash-movements')
      .set('Cookie', cajeroCookie)
      .send({
        movementType: 'EGRESO_MANUAL',
        amount: 50000,
        paymentMethod: 'EFECTIVO',
        reason: 'Egreso sin saldo',
      })
      .expect(400);

    expect(res.body.message).toContain('Saldo insuficiente en caja');
  });

  it.each([
    'TRANSFERENCIA',
    'TARJETA_DEBITO',
    'TARJETA_CREDITO',
    null,
    123,
    '',
  ])('rechaza el medio no efectivo o mal formado %s sin alterar Caja', async (paymentMethod) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/cash-movements')
      .set('Cookie', cajeroCookie)
      .send({
        movementType: 'INGRESO_MANUAL',
        amount: 10000,
        paymentMethod,
        reason: 'Intento de movimiento no efectivo',
      })
      .expect(400);

    expect(response.body.message).toContain('Caja solo admite movimientos en efectivo');
    expect(await prisma.cashMovement.count()).toBe(0);

    const balance = await request(app.getHttpServer())
      .get('/api/v1/cash-movements/balance')
      .set('Cookie', cajeroCookie)
      .expect(200);
    expect(balance.body.currentBalance).toBe(0);
  });

  it('acepta un medio omitido como EFECTIVO y no cambia la lectura de históricos no efectivos', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/cash-movements')
      .set('Cookie', cajeroCookie)
      .send({
        movementType: 'INGRESO_MANUAL',
        amount: 10000,
        reason: 'Ingreso físico sin medio explícito',
      })
      .expect(201);
    expect(response.body.paymentMethod).toBe('EFECTIVO');

    const historical = await prisma.cashMovement.create({
      data: {
        movementType: 'INGRESO_MANUAL',
        amount: '1000.00',
        paymentMethod: 'TRANSFERENCIA',
        reason: 'Histórico anterior a la separación Caja/Bancos',
        balanceAfter: '11000.00',
        createdByUserId: response.body.createdByUserId,
      },
    });
    const read = await request(app.getHttpServer())
      .get(`/api/v1/cash-movements/${historical.id}`)
      .set('Cookie', cajeroCookie)
      .expect(200);
    expect(read.body.paymentMethod).toBe('TRANSFERENCIA');
  });

  it('rechaza con 403 Forbidden a usuarios que no poseen el permiso requerido', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cash-movements')
      .set('Cookie', unauthorizedCookie)
      .send({
        movementType: 'INGRESO_MANUAL',
        amount: 50000,
        reason: 'Intento no autorizado',
      })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/cash-movements/balance')
      .set('Cookie', unauthorizedCookie)
      .expect(403);
  });
});
