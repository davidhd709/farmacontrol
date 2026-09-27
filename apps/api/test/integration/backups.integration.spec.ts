/**
 * ÉPICA 10 — HU-024: Copias de Seguridad, Resiliencia y Preparación de Producción
 *
 * Pruebas de integración con PostgreSQL real.
 * Cubre:
 * - GET /api/v1/backups/status
 * - POST /api/v1/backups/create
 * - POST /api/v1/backups/:filename/verify
 * - Restricciones de autorización RBAC (requiere BACKUPS_MANAGE)
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

describe('BackupsController (Integration with PostgreSQL & Backup Scripts — HU-024)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let adminCookie: string;
  let sinPermisoCookie: string;

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

    // Usuario administrador (tiene permiso BACKUPS_MANAGE)
    const adminUser = await provisioningService.provisionInitialUser({
      username: 'admin_backups',
      password: 'AdminPassword123!',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: { userId: adminUser.id!, roleId: adminRole.id },
    });

    // Usuario sin permiso de backups (cajero)
    const cajeroUser = await prisma.user.create({
      data: {
        username: 'cajero_backups',
        passwordHash: adminUser.passwordHash,
        isActive: true,
      },
    });
    const cajeroRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({
      data: { userId: cajeroUser.id, roleId: cajeroRole.id },
    });

    const adminLogin = await authService.login('admin_backups', 'AdminPassword123!');
    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    const cajeroLogin = await authService.login('cajero_backups', 'AdminPassword123!');
    sinPermisoCookie = `${SESSION_COOKIE_NAME}=${cajeroLogin.rawToken}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/backups/status devuelve el estado y listado de respaldos existentes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/backups/status')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalBackups');
    expect(res.body).toHaveProperty('isHealthyRpo');
    expect(res.body).toHaveProperty('backupDirectory');
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);

    if (res.body.items.length > 0) {
      const item = res.body.items[0];
      expect(item).toHaveProperty('filename');
      expect(item).toHaveProperty('sizeBytes');
      expect(item).toHaveProperty('sha256');
      expect(item).toHaveProperty('verified');
    }
  });

  it('POST /api/v1/backups/create genera un respaldo real y actualiza el estado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/backups/create')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('exitosa');
    expect(res.body).toHaveProperty('backup');
    expect(res.body.backup.filename).toMatch(/^farmacia_.*\.dump$/);
    expect(res.body.backup.sizeBytes).toBeGreaterThan(0);
    expect(res.body.backup.sha256).toMatch(/^[a-f0-9]{64}$/i);
    expect(res.body.backup.verified).toBe(true);
  }, 40000);

  it('POST /api/v1/backups/:filename/verify verifica la integridad de un respaldo generado', async () => {
    // Primero consultar el status para tomar el nombre del último respaldo
    const statusRes = await request(app.getHttpServer())
      .get('/api/v1/backups/status')
      .set('Cookie', adminCookie);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.items.length).toBeGreaterThan(0);

    const targetFile = statusRes.body.items[0].filename;

    const verifyRes = await request(app.getHttpServer())
      .post(`/api/v1/backups/${encodeURIComponent(targetFile)}/verify`)
      .set('Cookie', adminCookie);

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.filename).toBe(targetFile);
    expect(verifyRes.body.verified).toBe(true);
    expect(verifyRes.body.sha256Match).toBe(true);
  });

  it('rechaza consultas y operaciones a usuarios no autorizados (RBAC)', async () => {
    // Usuario sin permiso BACKUPS_MANAGE
    const getRes = await request(app.getHttpServer())
      .get('/api/v1/backups/status')
      .set('Cookie', sinPermisoCookie);
    expect(getRes.status).toBe(403);

    const postRes = await request(app.getHttpServer())
      .post('/api/v1/backups/create')
      .set('Cookie', sinPermisoCookie);
    expect(postRes.status).toBe(403);

    // Sin sesión (anónimo)
    const anonRes = await request(app.getHttpServer())
      .get('/api/v1/backups/status');
    expect(anonRes.status).toBe(401);
  });
});
