/**
 * ÉPICA 08 — HU-022: Procesos en Segundo Plano y Alertas de Vencimiento
 *
 * Pruebas de integración con PostgreSQL real.
 * Cubre:
 * - GET  /api/v1/alerts/summary
 * - GET  /api/v1/alerts/expirations
 * - POST /api/v1/alerts/evaluate
 * - POST /api/v1/alerts/jobs
 * - GET  /api/v1/alerts/jobs
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

describe('AlertsController (Integration with PostgreSQL real & Background Worker rules)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let adminCookie: string;
  let supervisorCookie: string;
  let sinPermisoCookie: string;

  let productId1: string;
  let productId2: string;
  let locationId: string;

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

    // 1. Usuarios con roles
    const adminUser = await provisioningService.provisionInitialUser({
      username: 'admin_alerts',
      password: 'AdminPassword123!',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: { userId: adminUser.id!, roleId: adminRole.id },
    });

    const supUser = await prisma.user.create({
      data: {
        username: 'supervisor_alerts',
        passwordHash: adminUser.passwordHash,
        isActive: true,
      },
    });
    const supervisorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'supervisor' } });
    await prisma.userRole.create({
      data: { userId: supUser.id, roleId: supervisorRole.id },
    });

    const noPermUser = await prisma.user.create({
      data: {
        username: 'noperm_user',
        passwordHash: adminUser.passwordHash,
        isActive: true,
      },
    });

    // 2. Iniciar sesión y obtener cookies
    const adminLogin = await authService.login('admin_alerts', 'AdminPassword123!');
    const supLogin = await authService.login('supervisor_alerts', 'AdminPassword123!');
    const noPermLogin = await authService.login('noperm_user', 'AdminPassword123!');

    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;
    supervisorCookie = `${SESSION_COOKIE_NAME}=${supLogin.rawToken}`;
    sinPermisoCookie = `${SESSION_COOKIE_NAME}=${noPermLogin.rawToken}`;

    // 3. Crear datos maestros de catálogo e inventario
    const cat = await prisma.category.create({
      data: { name: 'Antibióticos y Antivirales' },
    });

    const p1 = await prisma.product.create({
      data: {
        categoryId: cat.id,
        code: 'MED-AMOX-500',
        name: 'Amoxicilina 500mg Cápsulas',
        baseUnit: 'CAP',
        basePrice: '1200',
        baseCost: '800',
      },
    });
    productId1 = p1.id;

    const p2 = await prisma.product.create({
      data: {
        categoryId: cat.id,
        code: 'MED-IBUP-400',
        name: 'Ibuprofeno 400mg Tabletas',
        baseUnit: 'TAB',
        basePrice: '800',
        baseCost: '400',
      },
    });
    productId2 = p2.id;

    const loc = await prisma.location.create({
      data: { code: 'BOD-01', name: 'Bodega Principal', isDefault: true },
    });
    locationId = loc.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('Evaluación de Vencimientos y Generación de Alertas (RN-001, RN-002, RF-008)', () => {
    it('debe evaluar los lotes existentes y clasificar en VENCIDO, CRITICO, ALERTA y PROXIMO', async () => {
      const refDate = new Date('2026-06-01T00:00:00Z');

      // Crear 4 lotes con distintas fechas relativas a refDate (2026-06-01):
      // Lote 1: Vencido (venció hace 5 días -> 2026-05-27)
      await prisma.inventoryLot.create({
        data: {
          productId: productId1,
          locationId,
          lotNumber: 'LOT-VENC-01',
          expirationDate: new Date('2026-05-27T00:00:00Z'),
          currentQuantity: 25,
        },
      });

      // Lote 2: Crítico (vence en 15 días -> 2026-06-16)
      await prisma.inventoryLot.create({
        data: {
          productId: productId1,
          locationId,
          lotNumber: 'LOT-CRIT-02',
          expirationDate: new Date('2026-06-16T00:00:00Z'),
          currentQuantity: 50,
        },
      });

      // Lote 3: Alerta (vence en 45 días -> 2026-07-16)
      await prisma.inventoryLot.create({
        data: {
          productId: productId2,
          locationId,
          lotNumber: 'LOT-ALER-03',
          expirationDate: new Date('2026-07-16T00:00:00Z'),
          currentQuantity: 100,
        },
      });

      // Lote 4: Próximo (vence en 75 días -> 2026-08-15)
      await prisma.inventoryLot.create({
        data: {
          productId: productId2,
          locationId,
          lotNumber: 'LOT-PROX-04',
          expirationDate: new Date('2026-08-15T00:00:00Z'),
          currentQuantity: 200,
        },
      });

      // Lote 5: Normal (>90 días -> vence en 150 días, NO debe generar alerta activa)
      await prisma.inventoryLot.create({
        data: {
          productId: productId2,
          locationId,
          lotNumber: 'LOT-NORM-05',
          expirationDate: new Date('2026-11-01T00:00:00Z'),
          currentQuantity: 300,
        },
      });

      // Lote 6: Sin existencias (currentQuantity = 0, NO debe generar alerta activa)
      await prisma.inventoryLot.create({
        data: {
          productId: productId1,
          locationId,
          lotNumber: 'LOT-CERO-06',
          expirationDate: new Date('2026-05-15T00:00:00Z'),
          currentQuantity: 0,
        },
      });

      // Ejecutar escaneo via POST /api/v1/alerts/evaluate
      const evalRes = await request(app.getHttpServer())
        .post('/api/v1/alerts/evaluate')
        .set('Cookie', adminCookie)
        .send({ referenceDate: refDate.toISOString() })
        .expect(200);

      expect(evalRes.body.success).toBe(true);
      expect(evalRes.body.data.evaluatedLots).toBe(6);
      expect(evalRes.body.data.createdAlerts).toBe(4); // 4 lotes en riesgo con stock > 0

      // Consultar resumen numérico: GET /api/v1/alerts/summary
      const summaryRes = await request(app.getHttpServer())
        .get('/api/v1/alerts/summary')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(summaryRes.body.success).toBe(true);
      expect(summaryRes.body.data.totalActive).toBe(4);
      expect(summaryRes.body.data.vencidos).toBe(1);
      expect(summaryRes.body.data.criticos).toBe(1);
      expect(summaryRes.body.data.alertas).toBe(1);
      expect(summaryRes.body.data.proximos).toBe(1);

      // Consultar listado de expiraciones: GET /api/v1/alerts/expirations
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/alerts/expirations')
        .set('Cookie', supervisorCookie)
        .expect(200);

      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.total).toBe(4);
      expect(listRes.body.data.items.length).toBe(4);

      // El primer ítem debe ser el más urgente (ordenado por días restantes asc)
      expect(listRes.body.data.items[0].lotNumber).toBe('LOT-VENC-01');
      expect(listRes.body.data.items[0].severity).toBe('VENCIDO');
      expect(listRes.body.data.items[0].daysRemaining).toBeLessThanOrEqual(0);

      // Filtrar por severidad CRITICO
      const critRes = await request(app.getHttpServer())
        .get('/api/v1/alerts/expirations?severity=CRITICO')
        .set('Cookie', supervisorCookie)
        .expect(200);

      expect(critRes.body.data.total).toBe(1);
      expect(critRes.body.data.items[0].lotNumber).toBe('LOT-CRIT-02');

      // Filtrar por búsqueda de texto
      const searchRes = await request(app.getHttpServer())
        .get('/api/v1/alerts/expirations?search=Amoxicilina')
        .set('Cookie', supervisorCookie)
        .expect(200);

      expect(searchRes.body.data.total).toBe(2); // LOT-VENC-01 y LOT-CRIT-02
    });

    it('debe resolver la alerta automáticamente cuando el stock del lote se agota a 0', async () => {
      const refDate = new Date('2026-06-01T00:00:00Z');

      const lot = await prisma.inventoryLot.create({
        data: {
          productId: productId1,
          locationId,
          lotNumber: 'LOT-TEMP-01',
          expirationDate: new Date('2026-06-15T00:00:00Z'), // Crítico
          currentQuantity: 10,
        },
      });

      // Evaluar lote con stock
      await request(app.getHttpServer())
        .post('/api/v1/alerts/evaluate')
        .set('Cookie', adminCookie)
        .send({ referenceDate: refDate.toISOString() })
        .expect(200);

      let summary = await request(app.getHttpServer())
        .get('/api/v1/alerts/summary')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(summary.body.data.totalActive).toBe(1);

      // Simular que el lote se vendió y quedó en 0
      await prisma.inventoryLot.update({
        where: { id: lot.id },
        data: { currentQuantity: 0 },
      });

      // Ejecutar nuevo barrido
      const evalRes = await request(app.getHttpServer())
        .post('/api/v1/alerts/evaluate')
        .set('Cookie', adminCookie)
        .send({ referenceDate: refDate.toISOString() })
        .expect(200);

      expect(evalRes.body.data.resolvedAlerts).toBe(1);

      // Comprobar que en el resumen activo ya no figura
      summary = await request(app.getHttpServer())
        .get('/api/v1/alerts/summary')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(summary.body.data.totalActive).toBe(0);

      // Comprobar que la alerta sigue en BD con isResolved = true
      const alertInDb = await prisma.inventoryAlert.findUnique({
        where: {
          lotId_alertType: {
            lotId: lot.id,
            alertType: 'EXPIRATION',
          },
        },
      });
      expect(alertInDb?.isResolved).toBe(true);
      expect(alertInDb?.resolvedAt).toBeInstanceOf(Date);
    });
  });

  describe('Control de Trabajos en Segundo Plano (Background Jobs)', () => {
    it('debe encolar y consultar trabajos en background_jobs', async () => {
      // Encolar trabajo de evaluación
      const enqueueRes = await request(app.getHttpServer())
        .post('/api/v1/alerts/jobs')
        .set('Cookie', adminCookie)
        .send({ priority: 1 })
        .expect(201);

      expect(enqueueRes.body.success).toBe(true);
      expect(enqueueRes.body.data.jobType).toBe('EVALUATE_EXPIRATIONS');
      expect(enqueueRes.body.data.status).toBe('PENDING');

      // Consultar lista de jobs
      const jobsRes = await request(app.getHttpServer())
        .get('/api/v1/alerts/jobs')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(jobsRes.body.success).toBe(true);
      expect(jobsRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(jobsRes.body.data[0].jobType).toBe('EVALUATE_EXPIRATIONS');
    });

    it('debe rechazar acceso si el usuario no tiene permisos suficientes', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/alerts/evaluate')
        .set('Cookie', sinPermisoCookie)
        .send({})
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/v1/alerts/jobs')
        .set('Cookie', sinPermisoCookie)
        .send({})
        .expect(403);
    });
  });
});
