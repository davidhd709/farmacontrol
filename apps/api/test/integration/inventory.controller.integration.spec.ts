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
 * AUD-005: los endpoints de inventario deben registrar al usuario autenticado
 * como autor del movimiento y del evento de auditoría.
 */
describe('Inventory controllers (Integration with PostgreSQL & RBAC)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let supervisorId: string;
  let supervisorCookie: string;
  let productId: string;
  let locationId: string;
  let lotId: string;

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

    const supervisorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'supervisor' } });
    const supervisor = await provisioningService.provisionInitialUser({
      username: 'supervisor_inventario',
      password: 'SupervisorPassword#2026',
    });
    await prisma.userRole.create({ data: { userId: supervisor.id!, roleId: supervisorRole.id } });
    supervisorId = supervisor.id!;

    const login = await authService.login('supervisor_inventario', 'SupervisorPassword#2026');
    supervisorCookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;

    const location = await prisma.location.create({
      data: { code: 'INV-HTTP', name: 'Estante Inventario', isDefault: true },
    });
    locationId = location.id;
    const category = await prisma.category.create({
      data: { name: 'Analgésicos', description: 'Prueba de autoría de inventario' },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'ACE-500-HTTP',
        name: 'Acetaminofén 500mg HTTP',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('500.00'),
        baseCost: new Prisma.Decimal('200.00'),
        requiresLotControl: true,
      },
    });
    productId = product.id;

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 90);
    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId,
        lotNumber: 'LOT-HTTP-01',
        currentQuantity: 50,
        expirationDate,
        isActive: true,
      },
    });
    lotId = lot.id;
  });

  afterAll(async () => {
    await app.close();
    await cleanTestDatabase();
  });

  it('registra al usuario autenticado como autor de un ajuste manual', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/movements/adjust')
      .set('Cookie', supervisorCookie)
      .send({
        productId,
        lotId,
        adjustmentType: 'DECREMENTO',
        quantityBaseUnits: 3,
        reason: 'Unidades averiadas',
      })
      .expect(201);

    const movement = await prisma.inventoryMovement.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });
    expect(movement.createdByUserId).toBe(supervisorId);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'INVENTORY_MANUAL_ADJUSTMENT', entityId: movement.id },
    });
    expect(audit.userId).toBe(supervisorId);
  });

  describe('AUD-004: ningún endpoint mueve stock sin documento ni kardex', () => {
    it('no expone la asignación FEFO directa fuera de una venta', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inventory/products/${productId}/allocate-fefo`)
        .set('Cookie', supervisorCookie)
        .send({ quantityBaseUnits: 5 })
        .expect(404);

      const lot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } });
      expect(lot.currentQuantity).toBe(50);
    });

    it('no expone el registro genérico de movimientos de cualquier tipo', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inventory/movements')
        .set('Cookie', supervisorCookie)
        .send({ productId, lotId, movementType: 'ENTRADA_COMPRA', quantityBaseUnits: 10 })
        .expect(404);

      const lot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } });
      expect(lot.currentQuantity).toBe(50);
    });

    it('registra en el kardex la cantidad inicial de un lote nuevo, con autor', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/lots')
        .set('Cookie', supervisorCookie)
        .send({
          productId,
          locationId,
          lotNumber: 'LOT-HTTP-02',
          expirationDate: '2030-01-31',
          initialQuantity: 20,
        })
        .expect(201);

      const newLotId = res.body.data.id;
      const lot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: newLotId } });
      expect(lot.currentQuantity).toBe(20);

      const movements = await prisma.inventoryMovement.findMany({ where: { lotId: newLotId } });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        movementType: 'AJUSTE_POSITIVO',
        quantityBaseUnits: 20,
        balanceAfterBaseUnits: 20,
        referenceDocumentType: 'LOTE_INICIAL',
        referenceDocumentId: newLotId,
        createdByUserId: supervisorId,
      });
    });

    it('no genera movimiento cuando el lote nuevo no tiene cantidad inicial', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/lots')
        .set('Cookie', supervisorCookie)
        .send({ productId, locationId, lotNumber: 'LOT-HTTP-03', expirationDate: '2030-01-31' })
        .expect(201);

      const movements = await prisma.inventoryMovement.count({
        where: { lotId: res.body.data.id },
      });
      expect(movements).toBe(0);
    });
  });

  it('registra al usuario autenticado en la auditoría al crear una ubicación', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inventory/locations')
      .set('Cookie', supervisorCookie)
      .send({ code: 'BOD-02', name: 'Bodega secundaria' })
      .expect(201);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: res.body.data.id },
    });
    expect(audit.userId).toBe(supervisorId);
  });
});
