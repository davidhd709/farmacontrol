import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/**
 * AUD-004: el stock solo se mueve con un documento que lo respalde.
 * AUD-005: cada movimiento registra al usuario autenticado como autor.
 */
describe('Inventario (Integration with PostgreSQL & RBAC) — AUD-004 / AUD-005', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let adminId: string;
  let adminCookie: string;
  let productId: string;
  let locationId: string;

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
      username: 'inventory_admin',
      password: 'AdminPassword#2026',
    });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    const login = await authService.login('inventory_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;

    const location = await prisma.location.create({
      data: { code: 'INV-01', name: 'Estante Inventario', isDefault: true },
    });
    locationId = location.id;
    const category = await prisma.category.create({ data: { name: 'Analgésicos' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'IBU-400',
        name: 'Ibuprofeno 400mg',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('800.00'),
        baseCost: new Prisma.Decimal('300.00'),
        requiresLotControl: true,
      },
    });
    productId = product.id;
  }, 30000);

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
    await prisma.$disconnect();
  });

  function futureDate(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  it('POST /inventory/lots con existencia inicial deja un movimiento de kardex con autor y saldo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/lots')
      .set('Cookie', [adminCookie])
      .send({
        productId,
        locationId,
        lotNumber: 'L-INICIAL',
        expirationDate: futureDate(200),
        initialQuantity: 40,
      });

    expect(res.status).toBe(201);
    const lotId = res.body.data.id;

    const movements = await prisma.inventoryMovement.findMany({ where: { lotId } });
    expect(movements).toHaveLength(1);
    expect(movements[0].movementType).toBe('AJUSTE_POSITIVO');
    expect(movements[0].referenceDocumentType).toBe('SALDO_INICIAL');
    expect(movements[0].quantityBaseUnits).toBe(40);
    expect(movements[0].balanceAfterBaseUnits).toBe(40);
    expect(movements[0].createdByUserId).toBe(adminId);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'CREATE_INVENTORY_LOT', entityId: lotId },
    });
    expect(audit?.userId).toBe(adminId);
  });

  it('POST /inventory/lots sin existencia inicial no crea movimientos', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/lots')
      .set('Cookie', [adminCookie])
      .send({ productId, locationId, lotNumber: 'L-VACIO', expirationDate: futureDate(200) });

    expect(res.status).toBe(201);
    const count = await prisma.inventoryMovement.count({ where: { lotId: res.body.data.id } });
    expect(count).toBe(0);
  });

  it('POST /inventory/movements/adjust registra al usuario autenticado como autor', async () => {
    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId,
        lotNumber: 'L-AJUSTE',
        currentQuantity: 10,
        expirationDate: new Date(futureDate(120)),
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/movements/adjust')
      .set('Cookie', [adminCookie])
      .send({
        productId,
        lotId: lot.id,
        adjustmentType: 'DECREMENTO',
        quantityBaseUnits: 3,
        reason: 'Producto averiado',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.createdByUserId).toBe(adminId);
    expect(res.body.data.balanceAfterBaseUnits).toBe(7);
  });

  it('POST /inventory/movements/adjust rechaza cantidades fraccionarias', async () => {
    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId,
        lotNumber: 'L-FRACCION',
        currentQuantity: 10,
        expirationDate: new Date(futureDate(120)),
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/movements/adjust')
      .set('Cookie', [adminCookie])
      .send({
        productId,
        lotId: lot.id,
        adjustmentType: 'DECREMENTO',
        quantityBaseUnits: 2.5,
        reason: 'Prueba',
      });

    expect(res.status).toBe(400);
    const after = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } });
    expect(after.currentQuantity).toBe(10);
  });

  it('ya no existen rutas que muevan stock sin documento (movimiento genérico y allocate-fefo)', async () => {
    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId,
        lotNumber: 'L-SIN-DOC',
        currentQuantity: 10,
        expirationDate: new Date(futureDate(120)),
      },
    });

    const generic = await request(app.getHttpServer())
      .post('/api/v1/inventory/movements')
      .set('Cookie', [adminCookie])
      .send({ productId, lotId: lot.id, movementType: 'SALIDA_VENTA', quantityBaseUnits: -5 });
    expect(generic.status).toBe(404);

    const allocate = await request(app.getHttpServer())
      .post(`/api/v1/inventory/products/${productId}/allocate-fefo`)
      .set('Cookie', [adminCookie])
      .send({ quantityBaseUnits: 5 });
    expect(allocate.status).toBe(404);

    const after = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } });
    expect(after.currentQuantity).toBe(10);
  });
});
