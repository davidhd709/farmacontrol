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

describe('AuthController — Autenticación HTTP (Integration with PostgreSQL)', () => {
  let app: INestApplication;
  const hasher = new Argon2PasswordHasherAdapter({
    memoryCost: 19456, // Parámetros rápidos para testing
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });
  const userRepository = new PrismaUserRepository(prisma);

  const testUsername = 'cajero_http_test';
  const testPassword = 'Password#2026!';

  beforeAll(async () => {
    await cleanTestDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await cleanTestDatabase();
  });

  async function seedTestUser(
    username = testUsername,
    password = testPassword,
    isActive = true
  ): Promise<User> {
    const passwordHash = await hasher.hash(password);
    const user = User.create({
      username: Username.create(username),
      passwordHash,
      isActive,
    });
    return userRepository.create(user);
  }

  describe('POST /api/v1/auth/login', () => {
    it('debe autenticar con credenciales correctas, emitir cookie HttpOnly y retornar usuario público', async () => {
      const seededUser = await seedTestUser();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: testPassword,
        })
        .expect(200);

      // 1. Verificación del body JSON
      expect(response.body.message).toBe('Inicio de sesión exitoso.');
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(seededUser.id);
      expect(response.body.user.username).toBe(testUsername);
      expect(response.body.user.isActive).toBe(true);
      expect(response.body.user.roles).toBeDefined();
      expect(Array.isArray(response.body.user.roles)).toBe(true);
      expect(response.body.user.permissions).toBeDefined();
      expect(Array.isArray(response.body.user.permissions)).toBe(true);

      // Verificación de seguridad: no expone hashes ni tokens en JSON
      expect(response.body.user.passwordHash).toBeUndefined();
      expect(response.body.rawToken).toBeUndefined();
      expect(response.body.tokenHash).toBeUndefined();

      // 2. Verificación de la cookie Set-Cookie
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      expect(Array.isArray(setCookieHeader)).toBe(true);

      const sidCookie = setCookieHeader.find((c: string) => c.startsWith('sid='));
      expect(sidCookie).toBeDefined();
      expect(sidCookie).toContain('HttpOnly');
      expect(sidCookie).toContain('Path=/');
      expect(sidCookie).toContain('SameSite=Lax');

      // Extraer el rawToken de la cookie y verificar longitud hex de 64 caracteres
      const rawTokenMatch = sidCookie.match(/sid=([0-9a-f]{64})/i);
      expect(rawTokenMatch).not.toBeNull();
      const rawToken = rawTokenMatch[1];
      expect(rawToken).toHaveLength(64);

      // 3. Verificación en base de datos: el rawToken NO debe existir en PostgreSQL
      const dbSessions = await prisma.session.findMany({
        where: { userId: seededUser.id },
      });
      expect(dbSessions).toHaveLength(1);
      expect(dbSessions[0].tokenHash).not.toBe(rawToken);
    });

    it('debe rechazar con 401 si la contraseña es incorrecta (sin enumerar usuario)', async () => {
      await seedTestUser();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: 'ContrasenaIncorrecta1#',
        })
        .expect(401);

      expect(response.body.statusCode).toBe(401);
      expect(response.body.message).toBe('Nombre de usuario o contraseña incorrectos.');
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('debe rechazar con 401 si el usuario no existe con la misma respuesta uniforme', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: 'usuario_inexistente',
          password: testPassword,
        })
        .expect(401);

      expect(response.body.statusCode).toBe(401);
      expect(response.body.message).toBe('Nombre de usuario o contraseña incorrectos.');
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('debe rechazar con 401 si el usuario existe pero está desactivado', async () => {
      await seedTestUser('usuario_desactivado', testPassword, false);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: 'usuario_desactivado',
          password: testPassword,
        })
        .expect(401);

      expect(response.body.statusCode).toBe(401);
      expect(response.body.message).toBe('Nombre de usuario o contraseña incorrectos.');
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('debe rechazar con 400 Bad Request si los campos obligatorios están ausentes', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          password: testPassword,
        })
        .expect(400);
    });

    it('debe rechazar con 400 Bad Request si la contraseña excede los 128 caracteres (F-15)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: 'Pass#1' + 'a'.repeat(123), // 129 caracteres
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('debe retornar los datos del usuario autenticado al enviar una cookie de sesión válida', async () => {
      const user = await seedTestUser();

      // 1. Iniciar sesión para obtener la cookie
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: testPassword,
        });

      const cookie = loginRes.headers['set-cookie'];

      // 2. Consultar /me con la cookie recibida
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(meRes.body.user).toBeDefined();
      expect(meRes.body.user.id).toBe(user.id);
      expect(meRes.body.user.username).toBe(testUsername);
      expect(meRes.body.user.isActive).toBe(true);
      expect(meRes.body.user.roles).toBeDefined();
      expect(Array.isArray(meRes.body.user.roles)).toBe(true);
      expect(meRes.body.user.permissions).toBeDefined();
      expect(Array.isArray(meRes.body.user.permissions)).toBe(true);
      expect(meRes.body.user.passwordHash).toBeUndefined();
    });

    it('debe rechazar con 401 si no se envía la cookie de sesión', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);

      expect(res.body.statusCode).toBe(401);
    });

    it('debe rechazar con 401 si la cookie contiene un token manipulado o inexistente', async () => {
      const fakeToken = 'b'.repeat(64);
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', [`sid=${fakeToken}`])
        .expect(401);

      expect(res.body.statusCode).toBe(401);
    });

    it('debe rechazar con 401 y no con 500 ante cookies con percent-encoding malformado como sid=% (F-25)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', ['sid=%'])
        .expect(401);

      expect(res.body.statusCode).toBe(401);
      expect(res.body.message).toBe('No autenticado. Cookie de sesión ausente.');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('debe revocar la sesión en base de datos, limpiar la cookie y denegar accesos posteriores', async () => {
      await seedTestUser();

      // 1. Login
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: testPassword,
        });

      const cookie = loginRes.headers['set-cookie'];

      // 2. Logout
      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(200);

      expect(logoutRes.body.message).toBe('Sesión cerrada correctamente.');

      // Comprobar que la cookie fue limpiada en la cabecera de respuesta
      const clearCookie = logoutRes.headers['set-cookie'];
      expect(clearCookie).toBeDefined();
      const clearedSid = clearCookie.find((c: string) => c.startsWith('sid='));
      expect(clearedSid).toBeDefined();

      // 3. Verificar que la sesión quedó revocada en PostgreSQL
      const sessions = await prisma.session.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].revokedAt).not.toBeNull();

      // 4. Intento posterior de acceder a /me debe fallar con 401
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('debe responder exitosamente con 200 de forma idempotente aun sin cookie previa', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(200);

      expect(res.body.message).toBe('Sesión cerrada correctamente.');
    });

    it('debe responder exitosamente con 200 de forma idempotente ante cookies con percent-encoding malformado como sid=% (F-25)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', ['sid=%'])
        .expect(200);

      expect(res.body.message).toBe('Sesión cerrada correctamente.');
    });

    it('debe responder exitosamente con 200 de forma idempotente ante cookies con token de formato no hexadecimal', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', [`sid=${'z'.repeat(64)}`])
        .expect(200);

      expect(res.body.message).toBe('Sesión cerrada correctamente.');
    });
  });
});
