import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('PurchaseController (Integration with PostgreSQL, Inventory & RBAC)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let adminCookie: string;
  let cajeroCookie: string;

  let supplierId: string;
  let categoryId: string;
  let productId: string;
  let presentationId: string;
  let locationId: string;

  const validFutureDate = new Date();
  validFutureDate.setFullYear(validFutureDate.getFullYear() + 2);
  const validFutureDateStr = validFutureDate.toISOString().split('T')[0];

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
      username: 'purchase_admin',
      password: 'AdminPassword#2026',
    });

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: {
        userId: admin.id!,
        roleId: adminRole.id,
      },
    });

    const adminLogin = await authService.login('purchase_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    const cajeroUser = await prisma.user.create({
      data: {
        username: 'purchase_cajero',
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

    const cajeroLogin = await authService.login('purchase_cajero', 'AdminPassword#2026');
    cajeroCookie = `${SESSION_COOKIE_NAME}=${cajeroLogin.rawToken}`;

    // Proveedor
    const supplier = await prisma.supplier.create({
      data: {
        taxId: '900888777-1',
        name: 'Droguerías Aliadas de Occidente',
      },
    });
    supplierId = supplier.id;

    // Categoría y Producto
    const category = await prisma.category.create({
      data: { name: 'Analgésicos' },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        categoryId,
        code: 'IBU-400',
        name: 'Ibuprofeno 400mg',
        basePrice: 500,
        baseCost: 250,
      },
    });
    productId = product.id;

    // Presentación: Caja x 50
    const presentation = await prisma.productPresentation.create({
      data: {
        productId,
        name: 'Caja x 50',
        conversionFactor: 50,
        price: 25000,
        cost: 12500,
      },
    });
    presentationId = presentation.id;

    // Ubicación por defecto
    const location = await prisma.location.create({
      data: {
        code: 'BOD-CENTRAL',
        name: 'Bodega Central',
        isDefault: true,
      },
    });
    locationId = location.id;
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
    await prisma.$disconnect();
  });

  it('POST /api/v1/purchases/receive — recepciona compra, impacta lotes y genera Kardex en una transacción', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/purchases/receive')
      .set('Cookie', [adminCookie])
      .send({
        supplierId,
        invoiceNumber: 'FACT-2026-999',
        purchaseDate: '2026-09-26',
        notes: 'Recepción formal de ibuprofeno',
        lines: [
          {
            productId,
            presentationId,
            lotNumber: 'LOTE-IBU-001',
            expirationDate: validFutureDateStr,
            quantityCommercial: 10, // 10 cajas de 50 = 500 unidades base
            unitCost: 12000, // 10 * 12000 = 120000
            locationId,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.invoiceNumber).toBe('FACT-2026-999');
    expect(res.body.totalAmount).toBe('120000.00');
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].quantityBaseUnits).toBe(500);

    // 1. Verificar que el lote fue creado/actualizado con 500 unidades en la DB
    const lotInDb = await prisma.inventoryLot.findUnique({
      where: {
        productId_locationId_lotNumber: {
          productId,
          locationId,
          lotNumber: 'LOTE-IBU-001',
        },
      },
    });
    expect(lotInDb).not.toBeNull();
    expect(lotInDb?.currentQuantity).toBe(500);

    // 2. Verificar que se creó el movimiento inmutable en inventory_movements
    const movement = await prisma.inventoryMovement.findFirst({
      where: {
        referenceDocumentId: res.body.id,
        movementType: 'ENTRADA_COMPRA',
      },
    });
    expect(movement).not.toBeNull();
    expect(movement?.quantityBaseUnits).toBe(500);
    expect(movement?.balanceAfterBaseUnits).toBe(500);
  });

  it('POST /api/v1/purchases/receive — deniega acceso a usuario sin permiso purchases:receive (403)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/purchases/receive')
      .set('Cookie', [cajeroCookie])
      .send({
        supplierId,
        invoiceNumber: 'FACT-TEST',
        purchaseDate: '2026-09-26',
        lines: [
          {
            productId,
            lotNumber: 'L-1',
            expirationDate: validFutureDateStr,
            quantityCommercial: 1,
            unitCost: 100,
          },
        ],
      });

    expect(res.status).toBe(403);
  });

  it('GET /api/v1/purchases — lista compras realizadas con paginación y filtros', async () => {
    // Primero recibir una compra
    await request(app.getHttpServer())
      .post('/api/v1/purchases/receive')
      .set('Cookie', [adminCookie])
      .send({
        supplierId,
        invoiceNumber: 'FAC-LIST-1',
        purchaseDate: '2026-09-26',
        lines: [
          {
            productId,
            lotNumber: 'L-LIST-1',
            expirationDate: validFutureDateStr,
            quantityCommercial: 2,
            unitCost: 5000,
          },
        ],
      });

    const res = await request(app.getHttpServer())
      .get('/api/v1/purchases?invoiceNumber=FAC-LIST-1')
      .set('Cookie', [adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].invoiceNumber).toBe('FAC-LIST-1');
  });
});
