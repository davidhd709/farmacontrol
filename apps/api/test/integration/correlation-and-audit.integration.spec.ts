import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';

describe('CorrelationId & HTTP Audit Trail (Integration with PostgreSQL)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;

  beforeAll(async () => {
    await cleanTestDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    provisioningService = moduleFixture.get(UserProvisioningService);
  }, 30000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 30000);

  it('debe incluir automáticamente el header X-Correlation-Id (UUID v4) en cualquier respuesta HTTP', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.headers['x-correlation-id']).toBeDefined();
    expect(res.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('debe preservar y responder con el X-Correlation-Id enviado por el cliente', async () => {
    const customTraceId = 'client-trace-abc-12345';

    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Correlation-Id', customTraceId);

    expect(res.headers['x-correlation-id']).toBe(customTraceId);
  });

  it('debe auditar login exitoso en PostgreSQL vinculando userId y correlationId', async () => {
    await provisioningService.provisionInitialUser({
      username: 'audit_test_admin',
      password: 'SecurePassword#2026',
    });

    const traceId = 'trace-login-success-01';

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Correlation-Id', traceId)
      .send({
        username: 'audit_test_admin',
        password: 'SecurePassword#2026',
      });

    expect(res.status).toBe(200);
    expect(res.headers['x-correlation-id']).toBe(traceId);

    // Verificar registro en tabla inmutable audit_events en PostgreSQL
    const auditRecord = await prisma.auditEvent.findFirst({
      where: {
        correlationId: traceId,
      },
    });

    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.action).toBe('auth:login_success');
    expect(auditRecord?.entity).toBe('User');
    expect(auditRecord?.userId).toBe(res.body.user.id);
    expect(auditRecord?.details).toEqual({ username: 'audit_test_admin' });
  });

  it('debe auditar login fallido en PostgreSQL con userId null y correlationId trazable', async () => {
    const traceId = 'trace-login-failure-02';

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Correlation-Id', traceId)
      .send({
        username: 'usuario_inexistente',
        password: 'PasswordErronea#123',
      });

    expect(res.status).toBe(401);
    expect(res.headers['x-correlation-id']).toBe(traceId);
    expect(res.body.correlationId).toBe(traceId);

    // Verificar registro de auditoría de seguridad
    const auditRecord = await prisma.auditEvent.findFirst({
      where: {
        correlationId: traceId,
      },
    });

    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.action).toBe('auth:login_failure');
    expect(auditRecord?.entity).toBe('Auth');
    expect(auditRecord?.userId).toBeNull();
    expect(auditRecord?.details).toEqual({
      attemptedUsername: 'usuario_inexistente',
      reason: 'invalid_credentials',
    });
  });

  it('debe auditar logout en PostgreSQL con correlationId', async () => {
    await provisioningService.provisionInitialUser({
      username: 'logout_admin',
      password: 'SecurePassword#2026',
    });

    // 1. Iniciar sesión
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        username: 'logout_admin',
        password: 'SecurePassword#2026',
      });

    const cookieHeader = loginRes.headers['set-cookie'];
    expect(cookieHeader).toBeDefined();

    // 2. Cerrar sesión
    const logoutTraceId = 'trace-logout-03';
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader)
      .set('X-Correlation-Id', logoutTraceId);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers['x-correlation-id']).toBe(logoutTraceId);

    // 3. Comprobar evento de auditoría
    const auditRecord = await prisma.auditEvent.findFirst({
      where: {
        correlationId: logoutTraceId,
      },
    });

    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.action).toBe('auth:logout');
    expect(auditRecord?.entity).toBe('Session');
    expect(auditRecord?.userId).toBe(loginRes.body.user.id);
  });

  it('debe retornar 401 con correlationId y header ante acceso no autenticado a endpoint protegido', async () => {
    const traceId = 'trace-unauth-04';

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('X-Correlation-Id', traceId);

    expect(res.status).toBe(401);
    expect(res.headers['x-correlation-id']).toBe(traceId);
    expect(res.body.correlationId).toBe(traceId);
    expect(res.body.statusCode).toBe(401);
  });
});
