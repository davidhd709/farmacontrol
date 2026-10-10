import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { prisma, cleanTestDatabase } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { Argon2PasswordHasherAdapter } from '../../src/modules/identity/infrastructure/adapters/argon2-password-hasher.adapter';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/adapters/prisma-user.repository';
import { User } from '../../src/modules/identity/domain/entities/user.entity';
import { Username } from '../../src/modules/identity/domain/value-objects/username.vo';
import { RateLimiterService } from '../../src/common/services/rate-limiter.service';
import { getCorsConfig } from '../../src/common/config/cors.config';
import { configureHttpApp, parseTrustProxy } from '../../src/common/config/http-app.config';
import type { NestExpressApplication } from '@nestjs/platform-express';

describe('Security Hardening — Cabeceras OWASP, CORS y Fuerza Bruta (Integration)', () => {
  let app: INestApplication;
  let rateLimiter: RateLimiterService;

  const hasher = new Argon2PasswordHasherAdapter({
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });
  const userRepository = new PrismaUserRepository(prisma);

  const testUser = 'seguridad_admin';
  const testPass = 'Password#2026Segura!';

  beforeAll(async () => {
    await cleanTestDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    // Igual que en producción detrás de Caddy: un proxy de confianza
    process.env.TRUST_PROXY = '1';
    configureHttpApp(app as NestExpressApplication);
    delete process.env.TRUST_PROXY;
    app.setGlobalPrefix('api/v1');
    app.enableCors(getCorsConfig());

    rateLimiter = moduleFixture.get<RateLimiterService>(RateLimiterService);

    await app.init();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    if (rateLimiter) {
      rateLimiter.clearAll();
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await cleanTestDatabase();
  });

  async function seedTestUser(): Promise<User> {
    const passwordHash = await hasher.hash(testPass);
    const user = User.create({
      username: Username.create(testUser),
      passwordHash,
      isActive: true,
    });
    return userRepository.create(user);
  }

  describe('1. Cabeceras de Seguridad HTTP (OWASP Best Practices)', () => {
    it('debe inyectar todas las cabeceras de protección OWASP en respuestas de la API', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/auth/me');

      // 1. Content Security Policy (CSP)
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");

      // 2. MIME-Sniffing
      expect(response.headers['x-content-type-options']).toBe('nosniff');

      // 3. Anti-Clickjacking
      expect(response.headers['x-frame-options']).toBe('DENY');

      // 4. XSS Protection moderno
      expect(response.headers['x-xss-protection']).toBe('0');

      // 5. HSTS
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');

      // 6. Referrer Policy
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

      // 7. Aislamiento de origen
      expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');

      // 8. Permissions Policy
      expect(response.headers['permissions-policy']).toBeDefined();

      // 9. Supresión de X-Powered-By
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('2. Hardening de Política CORS', () => {
    it('debe permitir peticiones desde orígenes autorizados en la lista blanca con credenciales', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Origin', 'http://localhost:5173');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('debe responder adecuadamente al preflight OPTIONS desde origen permitido', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-max-age']).toBe('86400');
    });

    it('no debe emitir cabeceras de origen permitido para dominios no autorizados', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Origin', 'http://sitio-malicioso-ataque.com');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('3. Protección contra Fuerza Bruta en Login (Rate Limiting)', () => {
    it('debe bloquear con HTTP 429 tras 5 intentos fallidos consecutivos e incluir Retry-After', async () => {
      await seedTestUser();

      // 4 primeros intentos fallidos: deben responder 401 Unauthorized
      for (let i = 1; i <= 4; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ username: testUser, password: 'WrongPassword123!' });

        expect(res.status).toBe(401);
      }

      // 5to intento fallido: alcanza el umbral de 5 y se activa el bloqueo
      const fifthAttempt = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: testUser, password: 'WrongPassword123!' });

      expect(fifthAttempt.status).toBe(429);
      expect(fifthAttempt.headers['retry-after']).toBeDefined();
      expect(fifthAttempt.body.message).toContain('Demasiados intentos fallidos');

      // 6to intento: incluso enviando la contraseña CORRECTA, el bloqueo lo rechaza antes de validar credenciales
      const blockedAttempt = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: testUser, password: testPass });

      expect(blockedAttempt.status).toBe(429);
      expect(blockedAttempt.headers['retry-after']).toBeDefined();

      // Verificar que se registró el evento de auditoría de bloqueo por fuerza bruta
      const auditBlockedEvent = await prisma.auditEvent.findFirst({
        where: { action: 'auth:brute_force_blocked' },
      });
      expect(auditBlockedEvent).not.toBeNull();
      expect(auditBlockedEvent?.entity).toBe('Auth');
    });

    it('debe permitir autenticar normalmente si las credenciales son correctas y reiniciar contadores', async () => {
      await seedTestUser();

      // 2 intentos fallidos
      for (let i = 1; i <= 2; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ username: testUser, password: 'WrongPassword123!' })
          .expect(401);
      }

      // 3er intento exitoso con contraseña correcta
      const successRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: testUser, password: testPass })
        .expect(200);

      expect(successRes.body.user.username).toBe(testUser);

      // Los contadores debieron reiniciarse; un nuevo intento fallido debe ser 401 (no 429)
      const afterRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: testUser, password: 'WrongPassword123!' });

      expect(afterRes.status).toBe(401);
    });

    const login = (ip: string, username: string, password: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ username, password });

    it('AUD-012: los fallos desde una IP no bloquean la cuenta para quien entra desde otra', async () => {
      await seedTestUser();

      for (let i = 1; i <= 4; i++) {
        expect((await login('203.0.113.10', testUser, 'WrongPassword123!')).status).toBe(401);
      }
      expect((await login('203.0.113.10', testUser, 'WrongPassword123!')).status).toBe(429);
      // El atacante sigue bloqueado aunque acierte la contraseña
      expect((await login('203.0.113.10', testUser, testPass)).status).toBe(429);

      // El usuario legítimo en la farmacia entra sin problema
      expect((await login('198.51.100.20', testUser, testPass)).status).toBe(200);
    });

    it('AUD-012: una IP que prueba muchas cuentas queda bloqueada por el límite de IP', async () => {
      await seedTestUser();

      let lastStatus = 0;
      for (let i = 1; i <= 20; i++) {
        lastStatus = (await login('203.0.113.11', `inexistente_${i}`, 'WrongPassword123!')).status;
      }
      expect(lastStatus).toBe(429);
      // También para una cuenta válida con la contraseña correcta, mientras dure el bloqueo
      expect((await login('203.0.113.11', testUser, testPass)).status).toBe(429);
      // Otra IP no se ve afectada
      expect((await login('198.51.100.21', testUser, testPass)).status).toBe(200);
    });
  });

  describe('4. Confianza en el proxy (TRUST_PROXY)', () => {
    it('sin configurar no confía en ningún proxy: X-Forwarded-For del cliente se ignora', () => {
      expect(parseTrustProxy(undefined)).toBe(false);
      expect(parseTrustProxy('')).toBe(false);
      expect(parseTrustProxy('false')).toBe(false);
    });

    it('acepta número de saltos o lista de subredes', () => {
      expect(parseTrustProxy('1')).toBe(1);
      expect(parseTrustProxy(' loopback, 172.16.0.0/12 ')).toBe('loopback, 172.16.0.0/12');
    });
  });
});
