import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('CustomerController (Integration with PostgreSQL & RBAC)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let adminCookie: string;
  let readerCookie: string;
  let supervisorCookie: string;

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

    // Garantizar cliente por defecto en cada iteración de manera idempotente
    await prisma.customer.upsert({
      where: { documentNumber: '222222222222' },
      update: {
        documentType: 'CC',
        name: 'Consumidor Final (Cuantías Menores)',
        isDefault: true,
        isActive: true,
      },
      create: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final (Cuantías Menores)',
        isDefault: true,
        isActive: true,
      },
    });

    // 1. Usuario Admin (con todos los permisos incluyendo customers:manage y customers:read)
    const admin = await provisioningService.provisionInitialUser({
      username: 'customer_admin',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: {
        userId: admin.id!,
        roleId: adminRole.id,
      },
    });
    const adminLogin = await authService.login('customer_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    // 2. Usuario Solo Lectura (con customers:read pero sin customers:manage)
    const readerUser = await prisma.user.create({
      data: {
        username: 'customer_reader',
        passwordHash: admin.passwordHash,
        isActive: true,
      },
    });
    const readOnlyRole = await prisma.role.create({
      data: {
        name: 'solo_lectura_clientes',
        description: 'Rol para pruebas con solo lectura de clientes',
      },
    });
    const permRead = await prisma.permission.findUniqueOrThrow({
      where: { name: 'customers:read' },
    });
    await prisma.rolePermission.create({
      data: {
        roleId: readOnlyRole.id,
        permissionId: permRead.id,
      },
    });
    await prisma.userRole.create({
      data: {
        userId: readerUser.id,
        roleId: readOnlyRole.id,
      },
    });
    const readerLogin = await authService.login('customer_reader', 'AdminPassword#2026');
    readerCookie = `${SESSION_COOKIE_NAME}=${readerLogin.rawToken}`;

    const supervisorUser = await prisma.user.create({
      data: {
        username: 'customer_supervisor',
        passwordHash: admin.passwordHash,
        isActive: true,
      },
    });
    const supervisorRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'supervisor' },
    });
    await prisma.userRole.create({
      data: { userId: supervisorUser.id, roleId: supervisorRole.id },
    });
    const supervisorLogin = await authService.login('customer_supervisor', 'AdminPassword#2026');
    supervisorCookie = `${SESSION_COOKIE_NAME}=${supervisorLogin.rawToken}`;
  }, 30000);

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
  });

  it('GET /api/v1/customers/default retorna el cliente por defecto', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/customers/default')
      .set('Cookie', readerCookie);

    expect(res.status).toBe(200);
    expect(res.body.documentNumber).toBe('222222222222');
    expect(res.body.isDefault).toBe(true);
    expect(res.body.name).toContain('Consumidor Final');
  });

  it('POST /api/v1/customers permite crear clientes a usuarios con customers:manage', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Cookie', adminCookie)
      .send({
        documentType: 'CC',
        documentNumber: '1098765432',
        name: 'Andrea Morales',
        phone: '3123456789',
        email: 'andrea.morales@example.com',
        address: 'Calle 45 # 10-20',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.documentNumber).toBe('1098765432');
    expect(res.body.name).toBe('Andrea Morales');
    expect(res.body.isActive).toBe(true);

    const saved = await prisma.customer.findUnique({
      where: { documentNumber: '1098765432' },
    });
    expect(saved).not.toBeNull();
    expect(saved?.name).toBe('Andrea Morales');
  });

  it('POST /api/v1/customers rechaza la creación si el usuario carece de customers:manage (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Cookie', readerCookie)
      .send({
        documentType: 'CC',
        documentNumber: '9988776655',
        name: 'Cliente Sin Permiso',
      });

    expect(res.status).toBe(403);
  });

  it('POST /api/v1/customers rechaza documentos duplicados con 409 Conflict', async () => {
    const payload = {
      documentType: 'CC',
      documentNumber: '1010101010',
      name: 'Cliente Original',
    };

    const first = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Cookie', adminCookie)
      .send(payload);
    expect(first.status).toBe(201);

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/customers')
      .set('Cookie', adminCookie)
      .send(payload);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toContain('1010101010');
  });

  it('PUT /api/v1/customers/:id actualiza los datos y DELETE lo inactiva', async () => {
    const created = await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '1122334455',
        name: 'Nombre Antiguo',
        isActive: true,
      },
    });

    const updateRes = await request(app.getHttpServer())
      .put(`/api/v1/customers/${created.id}`)
      .set('Cookie', adminCookie)
      .send({
        name: 'Nombre Actualizado',
        phone: '3009998877',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Nombre Actualizado');
    expect(updateRes.body.phone).toBe('3009998877');

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/customers/${created.id}`)
      .set('Cookie', adminCookie);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.isActive).toBe(false);

    const afterDelete = await prisma.customer.findUnique({ where: { id: created.id } });
    expect(afterDelete?.isActive).toBe(false);
  });

  it('PUT permite al administrador corregir el documento sin cambiar el customerId y rechaza duplicados', async () => {
    const original = await prisma.customer.create({
      data: { documentType: 'CC', documentNumber: '1234567890', name: 'Cliente original' },
    });
    await prisma.customer.create({
      data: { documentType: 'CC', documentNumber: '9999999999', name: 'Cliente existente' },
    });

    const corrected = await request(app.getHttpServer())
      .put('/api/v1/customers/' + original.id)
      .set('Cookie', adminCookie)
      .send({ documentNumber: '1234567891' });

    expect(corrected.status).toBe(200);
    expect(corrected.body.id).toBe(original.id);
    expect(corrected.body.documentNumber).toBe('1234567891');

    const duplicate = await request(app.getHttpServer())
      .put('/api/v1/customers/' + original.id)
      .set('Cookie', adminCookie)
      .send({ documentNumber: '9999999999' });

    expect(duplicate.status).toBe(409);
    const persisted = await prisma.customer.findUniqueOrThrow({ where: { id: original.id } });
    expect(persisted.documentNumber).toBe('1234567891');
  });

  it('PUT impide al supervisor cambiar el documento pero conserva la edición ordinaria', async () => {
    const customer = await prisma.customer.create({
      data: { documentType: 'CC', documentNumber: '5555555555', name: 'Nombre inicial' },
    });

    const forbidden = await request(app.getHttpServer())
      .put('/api/v1/customers/' + customer.id)
      .set('Cookie', supervisorCookie)
      .send({ documentNumber: '5555555556', name: 'No debe persistir' });

    expect(forbidden.status).toBe(403);
    const unchanged = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(unchanged.documentNumber).toBe('5555555555');
    expect(unchanged.name).toBe('Nombre inicial');

    const ordinary = await request(app.getHttpServer())
      .put('/api/v1/customers/' + customer.id)
      .set('Cookie', supervisorCookie)
      .send({ name: 'Nombre permitido' });

    expect(ordinary.status).toBe(200);
    expect(ordinary.body.name).toBe('Nombre permitido');
  });

  it('DELETE /api/v1/customers/:id rechaza inactivar al cliente por defecto (400)', async () => {
    const defaultCust = await prisma.customer.findFirstOrThrow({
      where: { isDefault: true },
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/customers/${defaultCust.id}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('No se puede inactivar');
  });
});
