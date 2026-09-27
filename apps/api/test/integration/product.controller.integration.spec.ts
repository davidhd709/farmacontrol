import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { cleanTestDatabase, prisma, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('ProductController (Integration with PostgreSQL & RBAC)', () => {
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

    // 1. Admin con permisos completos
    const admin = await provisioningService.provisionInitialUser({
      username: 'product_admin',
      password: 'AdminPassword#2026',
    });

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: {
        userId: admin.id!,
        roleId: adminRole.id,
      },
    });

    const adminLogin = await authService.login('product_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    // 2. Cajero (solo lectura de productos, sin permiso de gestión)
    const cajeroUser = await prisma.user.create({
      data: {
        username: 'product_cajero',
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

    const cajeroLogin = await authService.login('product_cajero', 'AdminPassword#2026');
    cajeroCookie = `${SESSION_COOKIE_NAME}=${cajeroLogin.rawToken}`;
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
    await prisma.$disconnect();
  });

  it('POST /api/v1/products — debe registrar un producto con atributos farmacéuticos y registrar evento de auditoría', async () => {
    const category = await prisma.category.create({
      data: { name: 'Analgésicos' },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        categoryId: category.id,
        code: 'AMOX-500',
        barcode: '7701234567890',
        name: 'Amoxicilina 500mg',
        genericName: 'Amoxicilina Trihidrato',
        concentration: '500 mg',
        sanitaryRegistry: 'INVIMA 2021M-009876',
        manufacturer: 'Laboratorios Farmacia',
        description: 'Cápsulas antibióticas',
        requiresLotControl: true,
        prescriptionRequired: true,
        baseUnit: 'UNIDAD',
        basePrice: 2500.5,
        baseCost: 1500.0,
      });

    expect(response.status).toBe(201);
    expect(response.body.code).toBe('AMOX-500');
    expect(response.body.name).toBe('Amoxicilina 500mg');
    expect(response.body.basePrice).toBe('2500.50');
    expect(response.body.requiresLotControl).toBe(true);
    expect(response.body.categoryName).toBe('Analgésicos');

    // Comprobar auditoría
    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        action: 'catalog:product_created',
        entityId: response.body.id,
      },
    });
    expect(auditEvent).not.toBeNull();
  });

  it('POST /api/v1/products — debe rechazar la creación si el usuario no tiene permiso products:manage (403)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Antibióticos' },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', cajeroCookie)
      .send({
        categoryId: category.id,
        code: 'TEST-SKU',
        name: 'Producto No Autorizado',
        basePrice: 1000,
      });

    expect(response.status).toBe(403);
  });

  it('POST /api/v1/products — debe rechazar duplicados de código interno SKU (409 Conflict)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Antipiréticos' },
    });

    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        categoryId: category.id,
        code: 'PAR-500',
        name: 'Paracetamol 500mg',
        basePrice: 800,
      });

    const duplicateResponse = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        categoryId: category.id,
        code: 'PAR-500',
        name: 'Paracetamol Forte',
        basePrice: 900,
      });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.message).toContain('código interno');
  });

  it('GET /api/v1/products — debe listar productos y permitir filtrado por búsqueda textual (200)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Gastroenterología' },
    });

    await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        categoryId: category.id,
        code: 'OME-20',
        name: 'Omeprazol 20mg',
        genericName: 'Omeprazol',
        basePrice: 1800,
      });

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/products?search=Omeprazol')
      .set('Cookie', cajeroCookie);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items.length).toBe(1);
    expect(listResponse.body.items[0].code).toBe('OME-20');
  });

  it('PUT /api/v1/products/:id — debe actualizar los datos de un producto y registrar auditoría (200)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Cardiovascular' },
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        categoryId: category.id,
        code: 'LOS-50',
        name: 'Losartán Potásico 50mg',
        basePrice: 3200,
      });

    const productId = createRes.body.id;

    const updateRes = await request(app.getHttpServer())
      .put(`/api/v1/products/${productId}`)
      .set('Cookie', adminCookie)
      .send({
        name: 'Losartán Potásico 50mg Recubierto',
        basePrice: 3500.5,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Losartán Potásico 50mg Recubierto');
    expect(updateRes.body.basePrice).toBe('3500.50');

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        action: 'catalog:product_updated',
        entityId: productId,
      },
    });
    expect(auditEvent).not.toBeNull();
  });

  it('DELETE /api/v1/products/:id — debe inactivar lógicamente el producto (200)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Dermatología' },
    });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        categoryId: category.id,
        code: 'CLO-1',
        name: 'Clotrimazol Crema 1%',
        basePrice: 4500,
      });

    const productId = createRes.body.id;

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/products/${productId}`)
      .set('Cookie', adminCookie);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.isActive).toBe(false);

    // No debe aparecer en listados activos por defecto
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Cookie', adminCookie);

    const exists = listRes.body.items.some((p: { id: string }) => p.id === productId);
    expect(exists).toBe(false);
  });
});
