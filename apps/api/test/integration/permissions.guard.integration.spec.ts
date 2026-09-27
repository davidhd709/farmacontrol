import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, Delete, UseGuards, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '@farmacia/contracts';
import { AppModule } from '../../src/app.module';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import { SessionAuthGuard } from '../../src/modules/identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../src/modules/identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../src/modules/identity/presentation/decorators/require-permissions.decorator';
import { Argon2PasswordHasherAdapter } from '../../src/modules/identity/infrastructure/adapters/argon2-password-hasher.adapter';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/adapters/prisma-user.repository';
import { User } from '../../src/modules/identity/domain/entities/user.entity';
import { Username } from '../../src/modules/identity/domain/value-objects/username.vo';

@Controller('test-rbac')
@UseGuards(SessionAuthGuard, PermissionsGuard)
class TestRbacController {
  @Get('authenticated-only')
  public getOpenForAuthenticated() {
    return { ok: true, access: 'authenticated' };
  }

  @Get('sales')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_CREATE)
  public getSalesResource() {
    return { ok: true, access: 'sales' };
  }

  @Delete('users')
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_DELETE)
  public deleteUserResource() {
    return { ok: true, access: 'users_deleted' };
  }
}

describe('PermissionsGuard & @RequirePermissions — RBAC (Integration with PostgreSQL)', () => {
  let app: INestApplication;
  const hasher = new Argon2PasswordHasherAdapter({
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });
  const userRepository = new PrismaUserRepository(prisma);

  const defaultPassword = 'Password#2026!';

  beforeAll(async () => {
    await cleanTestDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, IdentityModule],
      controllers: [TestRbacController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
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
  }, 30000);

  async function createTestUserWithRoles(username: string, roleNames: string[] = []): Promise<{
    user: User;
    cookie: string[];
  }> {
    const passwordHash = await hasher.hash(defaultPassword);
    const user = await userRepository.create(
      User.create({
        username: Username.create(username),
        passwordHash,
        isActive: true,
      })
    );

    for (const roleName of roleNames) {
      const role = await prisma.role.findUnique({
        where: { name: roleName },
      });
      if (role) {
        await prisma.userRole.create({
          data: {
            userId: user.id!,
            roleId: role.id,
          },
        });
      }
    }

    // Login para obtener la cookie de sesión
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        username,
        password: defaultPassword,
      });

    const cookie = loginRes.headers['set-cookie'] as string[];
    return { user, cookie };
  }

  it('debe rechazar con 401 si no hay sesión autenticada', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/test-rbac/sales')
      .expect(401);

    expect(res.body.statusCode).toBe(401);
  });

  it('debe permitir acceso a ruta sin permisos requeridos a cualquier usuario autenticado', async () => {
    const { cookie } = await createTestUserWithRoles('usuario_sin_roles', []);

    const res = await request(app.getHttpServer())
      .get('/api/v1/test-rbac/authenticated-only')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toEqual({ ok: true, access: 'authenticated' });
  });

  it('debe denegar con 403 Forbidden si el usuario no tiene roles ni el permiso requerido', async () => {
    const { cookie } = await createTestUserWithRoles('usuario_sin_roles', []);

    const res = await request(app.getHttpServer())
      .get('/api/v1/test-rbac/sales')
      .set('Cookie', cookie)
      .expect(403);

    expect(res.body.statusCode).toBe(403);
    expect(res.body.message).toBe('Acceso denegado. Permisos insuficientes.');
  });

  it('debe permitir acceso con rol cajero al recurso de ventas (sales:create)', async () => {
    const { cookie } = await createTestUserWithRoles('cajero_autorizado', [SYSTEM_ROLES.CAJERO]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/test-rbac/sales')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toEqual({ ok: true, access: 'sales' });
  });

  it('debe denegar con 403 con rol cajero intentando eliminar usuarios (falta users:delete)', async () => {
    const { cookie } = await createTestUserWithRoles('cajero_no_admin', [SYSTEM_ROLES.CAJERO]);

    const res = await request(app.getHttpServer())
      .delete('/api/v1/test-rbac/users')
      .set('Cookie', cookie)
      .expect(403);

    expect(res.body.statusCode).toBe(403);
    expect(res.body.message).toBe('Acceso denegado. Permisos insuficientes.');
  });

  it('debe permitir acceso al administrador a todos los endpoints protegidos', async () => {
    const { cookie } = await createTestUserWithRoles('admin_supremo', [SYSTEM_ROLES.ADMIN]);

    // Ventas
    const salesRes = await request(app.getHttpServer())
      .get('/api/v1/test-rbac/sales')
      .set('Cookie', cookie)
      .expect(200);
    expect(salesRes.body.ok).toBe(true);

    // Eliminación de usuarios
    const deleteRes = await request(app.getHttpServer())
      .delete('/api/v1/test-rbac/users')
      .set('Cookie', cookie)
      .expect(200);
    expect(deleteRes.body.ok).toBe(true);
  });

  it('debe denegar con 403 si el rol asignado está inactivo (isActive: false)', async () => {
    const { cookie } = await createTestUserWithRoles('cajero_rol_inactivo', [SYSTEM_ROLES.CAJERO]);

    // Desactivar el rol cajero en la base de datos
    await prisma.role.update({
      where: { name: SYSTEM_ROLES.CAJERO },
      data: { isActive: false },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/test-rbac/sales')
      .set('Cookie', cookie)
      .expect(403);

    expect(res.body.statusCode).toBe(403);
    expect(res.body.message).toBe('Acceso denegado. Permisos insuficientes.');
  });
});
