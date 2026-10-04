import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { cleanTestDatabase, prisma, seedRbac } from '@farmacia/database';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';

describe('AuditController (Integration with PostgreSQL Real)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;
  let adminCookie: string;
  let cajeroCookie: string;
  let adminUserId: string;
  let sampleEventId: string;

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
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    // 1. Admin con permisos completos (incluyendo audit:read)
    const admin = await provisioningService.provisionInitialUser({
      username: 'audit_admin',
      password: 'AdminPassword#2026',
    });
    adminUserId = admin.id;

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: {
        userId: admin.id,
        roleId: adminRole.id,
      },
    });

    const adminLogin = await authService.login('audit_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    // 2. Cajero (sin permiso audit:read)
    const cajeroUser = await prisma.user.create({
      data: {
        username: 'audit_cajero',
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

    const cajeroLogin = await authService.login('audit_cajero', 'AdminPassword#2026');
    cajeroCookie = `${SESSION_COOKIE_NAME}=${cajeroLogin.rawToken}`;

    // 3. Crear eventos de auditoría de prueba
    const ev1 = await prisma.auditEvent.create({
      data: {
        userId: adminUserId,
        action: 'product:create',
        entity: 'product',
        entityId: 'prod-001',
        details: { name: 'Amoxicilina 500mg', basePrice: 1500 },
        ipAddress: '192.168.1.10',
        correlationId: 'corr-prod-create-001',
        createdAt: new Date('2026-10-01T10:00:00Z'),
      },
    });
    sampleEventId = ev1.id;

    await prisma.auditEvent.create({
      data: {
        userId: adminUserId,
        action: 'sale:confirm',
        entity: 'sale',
        entityId: 'sale-001',
        details: { invoiceNumber: 'VTA-001', total: 45000 },
        ipAddress: '192.168.1.10',
        correlationId: 'corr-sale-confirm-001',
        createdAt: new Date('2026-10-02T15:30:00Z'),
      },
    });

    await prisma.auditEvent.create({
      data: {
        userId: null,
        action: 'cash:movement',
        entity: 'cash',
        entityId: 'cash-001',
        details: { amount: 100000, type: 'APERTURA' },
        ipAddress: null,
        correlationId: 'corr-cash-001',
        createdAt: new Date('2026-10-03T08:00:00Z'),
      },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 45000);

  describe('Control de Acceso y RBAC', () => {
    it('deniega acceso anónimo a GET /api/v1/audit/events (401 Unauthorized)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/audit/events');
      expect(res.status).toBe(401);
    });

    it('deniega acceso a usuario sin permiso audit:read (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events')
        .set('Cookie', cajeroCookie);

      expect(res.status).toBe(403);
    });

    it('permite acceso a administrador con permiso audit:read (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
    });
  });

  describe('Consultas y Filtros Avanzados (GET /api/v1/audit/events)', () => {
    it('filtra por entidad específica (entity=product)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events?entity=product')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].entity).toBe('product');
      expect(res.body.items[0].user?.username).toBe('audit_admin');
    });

    it('filtra por acción específica (action=sale:confirm)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events?action=sale:confirm')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].action).toBe('sale:confirm');
      expect(res.body.items[0].entityId).toBe('sale-001');
    });

    it('filtra por correlationId exacto', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events?correlationId=corr-prod-create-001')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].correlationId).toBe('corr-prod-create-001');
    });

    it('filtra por rango de fechas (fromDate / toDate)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events?fromDate=2026-10-02&toDate=2026-10-02')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].action).toBe('sale:confirm');
    });

    it('filtra con búsqueda de texto libre (search)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events?search=sale')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].action).toBe('sale:confirm');
    });

    it('paginación correcta (page=1, pageSize=2)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events?page=1&pageSize=2')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.totalPages).toBe(2);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(2);
    });
  });

  describe('Metadatos y Detalle de Evento', () => {
    it('GET /api/v1/audit/metadata retorna listas de entidades y acciones registradas', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/metadata')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.entities).toContain('product');
      expect(res.body.entities).toContain('sale');
      expect(res.body.entities).toContain('cash');
      expect(res.body.actions).toContain('product:create');
      expect(res.body.actions).toContain('sale:confirm');
    });

    it('GET /api/v1/audit/events/:id retorna el detalle con JSONB completo y usuario actor', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/audit/events/${sampleEventId}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sampleEventId);
      expect(res.body.entity).toBe('product');
      expect(res.body.details).toEqual({ name: 'Amoxicilina 500mg', basePrice: 1500 });
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe('audit_admin');
    });

    it('GET /api/v1/audit/events/:id con ID inexistente retorna 404 Not Found', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events/00000000-0000-0000-0000-000000000000')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(404);
    });
  });
});
