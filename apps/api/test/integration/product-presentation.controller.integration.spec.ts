import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { cleanTestDatabase, prisma, seedRbac, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('ProductPresentationController (Integration with PostgreSQL & RBAC)', () => {
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

    // 1. Admin
    const admin = await provisioningService.provisionInitialUser({
      username: 'pres_admin',
      password: 'AdminPassword#2026',
    });

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: {
        userId: admin.id!,
        roleId: adminRole.id,
      },
    });

    const adminLogin = await authService.login('pres_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    // 2. Cajero (solo lectura de productos y presentaciones)
    const cajeroUser = await prisma.user.create({
      data: {
        username: 'pres_cajero',
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

    const cajeroLogin = await authService.login('pres_cajero', 'AdminPassword#2026');
    cajeroCookie = `${SESSION_COOKIE_NAME}=${cajeroLogin.rawToken}`;
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
    await prisma.$disconnect();
  });

  it('POST /api/v1/products/:productId/presentations — debe crear una presentación comercial y auditar el evento (201)', async () => {
    const category = await prisma.category.create({ data: { name: 'Analgésicos' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'ACET-500',
        name: 'Acetaminofén 500mg',
        basePrice: new Prisma.Decimal('500.00'),
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/presentations`)
      .set('Cookie', adminCookie)
      .send({
        name: 'Caja x 30',
        barcode: '7709876543210',
        conversionFactor: 30,
        price: 15000,
        cost: 6000,
        isDefault: true,
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.productId).toBe(product.id);
    expect(response.body.name).toBe('Caja x 30');
    expect(response.body.barcode).toBe('7709876543210');
    expect(response.body.conversionFactor).toBe(30);
    expect(response.body.price).toBe('15000.00');
    expect(response.body.cost).toBe('6000.00');
    expect(response.body.isDefault).toBe(true);

    // Auditoría
    const audit = await prisma.auditEvent.findFirst({
      where: {
        entity: 'ProductPresentation',
        entityId: response.body.id,
        action: 'catalog:presentation_created',
      },
    });
    expect(audit).toBeDefined();
    expect((audit?.details as any).name).toBe('Caja x 30');
  });

  it('POST /api/v1/products/:productId/presentations — debe denegar la creación a un usuario sin permiso products:manage (403)', async () => {
    const category = await prisma.category.create({ data: { name: 'Antibióticos' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'AMOX-500',
        name: 'Amoxicilina 500mg',
        basePrice: new Prisma.Decimal('2000.00'),
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/presentations`)
      .set('Cookie', cajeroCookie)
      .send({
        name: 'Caja x 12',
        conversionFactor: 12,
        price: 24000,
      });

    expect(response.status).toBe(403);
  });

  it('POST /api/v1/products/:productId/presentations — debe rechazar factor inválido (400) o nombre duplicado (409)', async () => {
    const category = await prisma.category.create({ data: { name: 'Cardiología' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'LOS-50',
        name: 'Losartán 50mg',
        basePrice: new Prisma.Decimal('1500.00'),
      },
    });

    // Factor 0
    const factorZeroResponse = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/presentations`)
      .set('Cookie', adminCookie)
      .send({
        name: 'Invalido Factor Cero',
        conversionFactor: 0,
        price: 1000,
      });
    expect(factorZeroResponse.status).toBe(400);

    // Crear una válida
    await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/presentations`)
      .set('Cookie', adminCookie)
      .send({
        name: 'Caja x 30',
        conversionFactor: 30,
        price: 40000,
      });

    // Duplicar nombre en el mismo producto -> 409
    const duplicateResponse = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/presentations`)
      .set('Cookie', adminCookie)
      .send({
        name: 'Caja x 30',
        conversionFactor: 30,
        price: 42000,
      });
    expect(duplicateResponse.status).toBe(409);
  });

  it('GET /api/v1/products/:productId/presentations — debe listar presentaciones ordenadas (200)', async () => {
    const category = await prisma.category.create({ data: { name: 'Gastroenterología' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'OMEP-20',
        name: 'Omeprazol 20mg',
        basePrice: new Prisma.Decimal('800.00'),
      },
    });

    await prisma.productPresentation.createMany({
      data: [
        {
          productId: product.id,
          name: 'Caja x 14',
          conversionFactor: 14,
          price: new Prisma.Decimal('11000.00'),
          isDefault: true,
        },
        {
          productId: product.id,
          name: 'Caja x 28',
          conversionFactor: 28,
          price: new Prisma.Decimal('21000.00'),
          isDefault: false,
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/products/${product.id}/presentations`)
      .set('Cookie', cajeroCookie);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].isDefault).toBe(true);
    expect(response.body[0].name).toBe('Caja x 14');
  });

  it('PUT /api/v1/products/:productId/presentations/:id — debe actualizar datos de la presentación (200)', async () => {
    const category = await prisma.category.create({ data: { name: 'Antialérgicos' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'CET-10',
        name: 'Cetirizina 10mg',
        basePrice: new Prisma.Decimal('1000.00'),
      },
    });

    const presentation = await prisma.productPresentation.create({
      data: {
        productId: product.id,
        name: 'Caja x 10',
        conversionFactor: 10,
        price: new Prisma.Decimal('10000.00'),
      },
    });

    const response = await request(app.getHttpServer())
      .put(`/api/v1/products/${product.id}/presentations/${presentation.id}`)
      .set('Cookie', adminCookie)
      .send({
        name: 'Caja x 10 Tabletas Recubiertas',
        price: 11500,
      });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Caja x 10 Tabletas Recubiertas');
    expect(response.body.price).toBe('11500.00');
  });

  it('PUT propaga factores acumulados a todos los descendientes', async () => {
    const category = await prisma.category.create({ data: { name: 'Jerarquías' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'JER-001',
        name: 'Producto jerárquico',
        basePrice: new Prisma.Decimal('100.00'),
      },
    });
    const blister = await prisma.productPresentation.create({
      data: {
        productId: product.id,
        name: 'Blíster',
        quantityContained: 10,
        conversionFactor: 10,
        price: new Prisma.Decimal('1000.00'),
      },
    });
    const box = await prisma.productPresentation.create({
      data: {
        productId: product.id,
        name: 'Caja',
        containedPresentationId: blister.id,
        quantityContained: 100,
        conversionFactor: 1000,
        price: new Prisma.Decimal('100000.00'),
      },
    });
    const master = await prisma.productPresentation.create({
      data: {
        productId: product.id,
        name: 'Master',
        containedPresentationId: box.id,
        quantityContained: 2,
        conversionFactor: 2000,
        price: new Prisma.Decimal('200000.00'),
      },
    });

    const response = await request(app.getHttpServer())
      .put('/api/v1/products/' + product.id + '/presentations/' + blister.id)
      .set('Cookie', adminCookie)
      .send({ quantityContained: 20 });

    expect(response.status).toBe(200);
    expect(response.body.conversionFactor).toBe(20);

    const persisted = await prisma.productPresentation.findMany({
      where: { id: { in: [box.id, master.id] } },
      orderBy: { name: 'asc' },
    });
    expect(persisted.find((item) => item.id === box.id)?.conversionFactor).toBe(2000);
    expect(persisted.find((item) => item.id === master.id)?.conversionFactor).toBe(4000);
  });

  it('la base de datos rechaza quantityContained no positivo', async () => {
    const category = await prisma.category.create({ data: { name: 'Restricciones' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'CHK-001',
        name: 'Producto constraint',
        basePrice: new Prisma.Decimal('100.00'),
      },
    });

    await expect(
      prisma.productPresentation.create({
        data: {
          productId: product.id,
          name: 'Inválida',
          quantityContained: 0,
          conversionFactor: 1,
          price: new Prisma.Decimal('100.00'),
        },
      }),
    ).rejects.toBeDefined();
  });

  it('DELETE /api/v1/products/:productId/presentations/:id — debe inactivar presentación no default y rechazar default (200/400)', async () => {
    const category = await prisma.category.create({ data: { name: 'Vitaminas' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'VIT-E',
        name: 'Vitamina E 400UI',
        basePrice: new Prisma.Decimal('1200.00'),
      },
    });

    const defaultPres = await prisma.productPresentation.create({
      data: {
        productId: product.id,
        name: 'Caja x 30',
        conversionFactor: 30,
        price: new Prisma.Decimal('36000.00'),
        isDefault: true,
      },
    });

    const secondaryPres = await prisma.productPresentation.create({
      data: {
        productId: product.id,
        name: 'Blíster x 10',
        conversionFactor: 10,
        price: new Prisma.Decimal('13000.00'),
        isDefault: false,
      },
    });

    // Inactivar default -> 400
    const failDefault = await request(app.getHttpServer())
      .delete(`/api/v1/products/${product.id}/presentations/${defaultPres.id}`)
      .set('Cookie', adminCookie);
    expect(failDefault.status).toBe(400);

    // Inactivar secundaria -> 200
    const successSec = await request(app.getHttpServer())
      .delete(`/api/v1/products/${product.id}/presentations/${secondaryPres.id}`)
      .set('Cookie', adminCookie);
    expect(successSec.status).toBe(200);
    expect(successSec.body.isActive).toBe(false);
  });

  it('POST /api/v1/products/:productId/presentations/:id/convert — debe realizar conversión de unidades (RN-004) (200)', async () => {
    const category = await prisma.category.create({ data: { name: 'Pediatría' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'AMOX-SUSP',
        name: 'Amoxicilina 250mg/5ml',
        basePrice: new Prisma.Decimal('15000.00'),
      },
    });

    const presentation = await prisma.productPresentation.create({
      data: {
        productId: product.id,
        name: 'Pack x 3 Frascos',
        conversionFactor: 3,
        price: new Prisma.Decimal('42000.00'),
      },
    });

    // toBase: 4 packs = 12 frascos
    const toBaseResponse = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/presentations/${presentation.id}/convert`)
      .set('Cookie', cajeroCookie)
      .send({
        quantity: 4,
        direction: 'toBase',
      });
    expect(toBaseResponse.status).toBe(200);
    expect(toBaseResponse.body.baseUnits).toBe(12);

    // fromBase: 11 frascos = 3 packs + 2 frascos
    const fromBaseResponse = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/presentations/${presentation.id}/convert`)
      .set('Cookie', cajeroCookie)
      .send({
        quantity: 11,
        direction: 'fromBase',
      });
    expect(fromBaseResponse.status).toBe(200);
    expect(fromBaseResponse.body.wholePresentations).toBe(3);
    expect(fromBaseResponse.body.remainderBaseUnits).toBe(2);
  });
});
