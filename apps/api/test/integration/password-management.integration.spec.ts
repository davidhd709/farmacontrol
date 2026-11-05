import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { Argon2PasswordHasherAdapter } from '../../src/modules/identity/infrastructure/adapters/argon2-password-hasher.adapter';

describe('Contraseñas de usuarios', () => {
  let app: INestApplication;
  let adminId: string;
  let cashierId: string;
  const oldPassword = 'Anterior#2026A';
  const newPassword = 'NuevaClave#2026B';
  const hasher = new Argon2PasswordHasherAdapter({
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const api = () => request(app.getHttpServer());
  const login = async (username: string, password = oldPassword) =>
    api().post('/api/v1/auth/login').send({ username, password });
  const cookieOf = (response: Awaited<ReturnType<typeof login>>) =>
    (response.headers['set-cookie'] as string[]).find((value) => value.startsWith('sid='))!;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    const passwordHash = await hasher.hash(oldPassword);
    adminId = (
      await prisma.user.create({
        data: {
          username: 'admin_password_test',
          passwordHash,
          userRoles: { create: [{ roleId: adminRole.id }] },
        },
      })
    ).id;
    cashierId = (
      await prisma.user.create({
        data: {
          username: 'cashier_password_test',
          passwordHash,
          userRoles: { create: [{ roleId: cashierRole.id }] },
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  it('el gestor restablece la contraseña, revoca sesiones y registra auditoría sin secretos', async () => {
    const adminCookie = cookieOf(await login('admin_password_test').then((r) => r));
    const cashierCookie = cookieOf(await login('cashier_password_test').then((r) => r));
    await api()
      .post(`/api/v1/users/${cashierId}/reset-password`)
      .set('Cookie', adminCookie)
      .send({ newPassword })
      .expect(200);

    await api().get('/api/v1/auth/me').set('Cookie', cashierCookie).expect(401);
    await api().get('/api/v1/auth/me').set('Cookie', adminCookie).expect(200);
    await login('cashier_password_test', oldPassword).then((r) => expect(r.status).toBe(401));
    await login('cashier_password_test', newPassword).then((r) => expect(r.status).toBe(200));
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'auth:password_reset_by_manager', entityId: cashierId },
    });
    expect(audit.userId).toBe(adminId);
    expect(JSON.stringify(audit.details)).not.toContain(newPassword);
    expect(JSON.stringify(audit.details)).not.toContain(oldPassword);
  });

  it('solo quien tiene permiso de actualización puede restablecer claves', async () => {
    const cashierCookie = cookieOf(await login('cashier_password_test').then((r) => r));
    await api()
      .post(`/api/v1/users/${adminId}/reset-password`)
      .set('Cookie', cashierCookie)
      .send({ newPassword })
      .expect(403);
    await api().post(`/api/v1/users/${adminId}/reset-password`).send({ newPassword }).expect(401);
    expect(
      await hasher.verify(
        oldPassword,
        (await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).passwordHash,
      ),
    ).toBe(true);
  });

  it('rechaza claves débiles y usuarios inexistentes sin alterar la contraseña vigente', async () => {
    const adminCookie = cookieOf(await login('admin_password_test').then((r) => r));
    await api()
      .post(`/api/v1/users/${cashierId}/reset-password`)
      .set('Cookie', adminCookie)
      .send({ newPassword: '123' })
      .expect(400);
    await api()
      .post('/api/v1/users/00000000-0000-4000-8000-000000000000/reset-password')
      .set('Cookie', adminCookie)
      .send({ newPassword })
      .expect(404);
    await api().get('/api/v1/auth/me').set('Cookie', adminCookie).expect(200);
    expect(
      await hasher.verify(
        oldPassword,
        (await prisma.user.findUniqueOrThrow({ where: { id: cashierId } })).passwordHash,
      ),
    ).toBe(true);
  });

  it('cada usuario cambia su clave con la actual y quedan revocadas todas sus sesiones', async () => {
    const firstCookie = cookieOf(await login('cashier_password_test').then((r) => r));
    const secondCookie = cookieOf(await login('cashier_password_test').then((r) => r));
    const response = await api()
      .post('/api/v1/auth/change-password')
      .set('Cookie', firstCookie)
      .send({ currentPassword: oldPassword, newPassword })
      .expect(200);
    expect(response.headers['set-cookie'].some((value: string) => value.startsWith('sid=;'))).toBe(
      true,
    );
    await api().get('/api/v1/auth/me').set('Cookie', firstCookie).expect(401);
    await api().get('/api/v1/auth/me').set('Cookie', secondCookie).expect(401);
    await login('cashier_password_test', oldPassword).then((r) => expect(r.status).toBe(401));
    await login('cashier_password_test', newPassword).then((r) => expect(r.status).toBe(200));
    expect(
      await prisma.auditEvent.count({
        where: { action: 'auth:password_changed_by_user', userId: cashierId },
      }),
    ).toBe(1);
  });

  it('una clave actual incorrecta, igual o débil no cambia la clave ni cierra la sesión', async () => {
    const cookie = cookieOf(await login('cashier_password_test').then((r) => r));
    await api()
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'Incorrecta#2026A', newPassword })
      .expect(401);
    await api()
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: oldPassword, newPassword: oldPassword })
      .expect(400);
    await api()
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: oldPassword, newPassword: 'corta' })
      .expect(400);
    await api().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    expect(
      await prisma.auditEvent.count({
        where: { action: 'auth:password_changed_by_user' },
      }),
    ).toBe(0);
  });

  it('restablecer la contraseña propia desde el gestor también cierra su sesión', async () => {
    const adminCookie = cookieOf(await login('admin_password_test').then((r) => r));
    const response = await api()
      .post(`/api/v1/users/${adminId}/reset-password`)
      .set('Cookie', adminCookie)
      .send({ newPassword })
      .expect(200);
    expect(response.headers['set-cookie'].some((value: string) => value.startsWith('sid=;'))).toBe(
      true,
    );
    await api().get('/api/v1/auth/me').set('Cookie', adminCookie).expect(401);
  });

  it('una contraseña asignada por el gestor obliga a cambiarla antes de usar el sistema', async () => {
    const adminCookie = cookieOf(await login('admin_password_test'));
    const temporary = 'Temporal#2026C';
    const created = await api()
      .post('/api/v1/users')
      .set('Cookie', adminCookie)
      .send({ username: 'nuevo_gestor', password: temporary, roles: ['admin'] })
      .expect(201);
    expect(created.body.mustChangePassword).toBe(true);

    const first = await login('nuevo_gestor', temporary);
    expect(first.status).toBe(200);
    expect(first.body.user.mustChangePassword).toBe(true);
    const cookie = cookieOf(first);

    const me = await api().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.user.mustChangePassword).toBe(true);
    const blocked = await api().get('/api/v1/users').set('Cookie', cookie).expect(403);
    expect(blocked.body.details).toEqual({ code: 'PASSWORD_CHANGE_REQUIRED' });

    await api()
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: temporary, newPassword })
      .expect(200);

    const second = await login('nuevo_gestor', newPassword);
    expect(second.body.user.mustChangePassword).toBe(false);
    await api().get('/api/v1/users').set('Cookie', cookieOf(second)).expect(200);
  });

  it('restablecer desde el gestor vuelve a marcar la contraseña como temporal', async () => {
    const adminCookie = cookieOf(await login('admin_password_test'));
    expect((await login('cashier_password_test')).body.user.mustChangePassword).toBe(false);
    await api()
      .post(`/api/v1/users/${cashierId}/reset-password`)
      .set('Cookie', adminCookie)
      .send({ newPassword })
      .expect(200);

    const relogin = await login('cashier_password_test', newPassword);
    expect(relogin.body.user.mustChangePassword).toBe(true);
    const users = await api().get('/api/v1/users').set('Cookie', adminCookie).expect(200);
    expect(
      users.body.find((u: { id: string }) => u.id === cashierId).mustChangePassword,
    ).toBe(true);
  });
});

