import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('CategoryController (Integration with PostgreSQL & RBAC)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let adminCookie: string;
  let cajeroCookie: string;

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

    const admin = await provisioningService.provisionInitialUser({
      username: 'catalog_admin',
      password: 'AdminPassword#2026',
    });

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: {
        userId: admin.id!,
        roleId: adminRole.id,
      },
    });

    const adminLogin = await authService.login('catalog_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    // 2. Crear usuario cajero con solo rol cajero (no tiene categories:manage, tiene categories:read)
    const cajeroUser = await prisma.user.create({
      data: {
        username: 'catalog_cajero',
        passwordHash: admin.passwordHash,
        isActive: true,
      },
    });

    const cajeroRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({
      data: {
        userId: cajeroUser.id,
        roleId: cajeroRole.id,
      },
    });

    const cajeroLogin = await authService.login('catalog_cajero', 'AdminPassword#2026');
    cajeroCookie = `${SESSION_COOKIE_NAME}=${cajeroLogin.rawToken}`;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 30000);

  describe('POST /api/v1/categories', () => {
    it('debe rechazar con 401 si no hay sesión autenticada', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .send({ name: 'Analgésicos' });

      expect(res.status).toBe(401);
    });

    it('debe denegar con 403 Forbidden si el rol no tiene permiso categories:manage', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Cookie', cajeroCookie)
        .send({ name: 'Analgésicos' });

      expect(res.status).toBe(403);
    });

    it('debe crear una categoría y registrar auditoría en PostgreSQL cuando está autorizado', async () => {
      const traceId = 'trace-cat-create-01';

      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Cookie', adminCookie)
        .set('X-Correlation-Id', traceId)
        .send({
          name: 'Analgésicos',
          description: 'Alivio del dolor y fiebre',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Analgésicos');
      expect(res.body.description).toBe('Alivio del dolor y fiebre');
      expect(res.body.isActive).toBe(true);

      // Verificar persistencia en PostgreSQL
      const dbCat = await prisma.category.findUnique({
        where: { id: res.body.id },
      });
      expect(dbCat).not.toBeNull();
      expect(dbCat?.name).toBe('Analgésicos');

      // Verificar evento de auditoría
      const audit = await prisma.auditEvent.findFirst({
        where: { correlationId: traceId },
      });
      expect(audit).not.toBeNull();
      expect(audit?.action).toBe('catalog:category_created');
      expect(audit?.entity).toBe('Category');
      expect(audit?.entityId).toBe(res.body.id);
    });

    it('debe rechazar con 409 Conflict si ya existe una categoría con el mismo nombre', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Cookie', adminCookie)
        .send({ name: 'Antibióticos' });

      const duplicateRes = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Cookie', adminCookie)
        .send({ name: 'antibióticos' });

      expect(duplicateRes.status).toBe(409);
    });
  });

  describe('GET /api/v1/categories', () => {
    beforeEach(async () => {
      await prisma.category.createMany({
        data: [
          { name: 'Analgésicos', description: 'Dolor y fiebre', isActive: true },
          { name: 'Antibióticos', description: 'Infecciones bacterianas', isActive: true },
          { name: 'Antihistamínicos', description: 'Alergias', isActive: false },
        ],
      });
    });

    it('debe listar solo categorías activas por defecto', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Cookie', cajeroCookie);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items.every((c: { isActive: boolean }) => c.isActive)).toBe(true);
    });

    it('debe filtrar por texto de búsqueda', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories?search=biótico')
        .set('Cookie', cajeroCookie);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe('Antibióticos');
    });

    it('debe paginar correctamente los resultados', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories?page=1&pageSize=1')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(1);
      expect(res.body.totalPages).toBe(2);
    });
  });

  describe('PUT & DELETE /api/v1/categories/:id', () => {
    it('debe actualizar los datos de una categoría y auditar el cambio', async () => {
      const created = await prisma.category.create({
        data: { name: 'Dermatología', description: 'Piel' },
      });

      const traceId = 'trace-cat-update-02';

      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/categories/${created.id}`)
        .set('Cookie', adminCookie)
        .set('X-Correlation-Id', traceId)
        .send({
          name: 'Dermatología Avanzada',
          description: 'Cuidado integral de la piel',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('Dermatología Avanzada');
      expect(updateRes.body.description).toBe('Cuidado integral de la piel');

      // Verificar evento de auditoría
      const audit = await prisma.auditEvent.findFirst({
        where: { correlationId: traceId },
      });
      expect(audit).not.toBeNull();
      expect(audit?.action).toBe('catalog:category_updated');
    });

    it('debe inactivar lógicamente la categoría con DELETE', async () => {
      const created = await prisma.category.create({
        data: { name: 'Inactivable', isActive: true },
      });

      const traceId = 'trace-cat-delete-03';

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/categories/${created.id}`)
        .set('Cookie', adminCookie)
        .set('X-Correlation-Id', traceId);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.category.isActive).toBe(false);

      const dbCheck = await prisma.category.findUnique({
        where: { id: created.id },
      });
      expect(dbCheck?.isActive).toBe(false);

      const audit = await prisma.auditEvent.findFirst({
        where: { correlationId: traceId },
      });
      expect(audit).not.toBeNull();
      expect(audit?.action).toBe('catalog:category_deactivated');
    });
  });
});
