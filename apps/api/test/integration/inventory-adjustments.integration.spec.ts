import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';
import { AuditService } from '../../src/modules/audit/application/services/audit.service';

/**
 * FARM-AUD-004: un ajuste solo puede mover el lote del producto indicado y el kardex registra el
 * producto dueño del lote. FARM-AUD-012: el motivo se guarda completo en su propio campo y un
 * texto fuera de límites responde 400 sin efectos.
 */
describe('Ajustes manuales de inventario (FARM-AUD-004 / FARM-AUD-012)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;
  let auditService: AuditService;

  let supervisorId: string;
  let supervisorCookie: string;
  let productAId: string;
  let productBId: string;
  let lotAId: string;
  let lotBId: string;

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
    auditService = moduleFixture.get(AuditService);
  }, 30000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    const supervisorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'supervisor' } });
    const supervisor = await provisioningService.provisionInitialUser({
      username: 'supervisor_ajustes',
      password: 'SupervisorPassword#2026',
    });
    await prisma.userRole.create({ data: { userId: supervisor.id!, roleId: supervisorRole.id } });
    supervisorId = supervisor.id!;
    const login = await authService.login('supervisor_ajustes', 'SupervisorPassword#2026');
    supervisorCookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;

    const location = await prisma.location.create({
      data: { code: 'AJU-01', name: 'Estante Ajustes', isDefault: true },
    });
    const category = await prisma.category.create({ data: { name: 'Analgésicos' } });
    const createProduct = (code: string, name: string) =>
      prisma.product.create({
        data: {
          categoryId: category.id,
          code,
          name,
          baseUnit: 'TABLETA',
          basePrice: new Prisma.Decimal('500.00'),
          baseCost: new Prisma.Decimal('200.00'),
          requiresLotControl: true,
        },
      });
    productAId = (await createProduct('ACE-500', 'Acetaminofén 500mg')).id;
    productBId = (await createProduct('IBU-400', 'Ibuprofeno 400mg')).id;

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 120);
    const createLot = (productId: string, lotNumber: string, currentQuantity: number) =>
      prisma.inventoryLot.create({
        data: {
          productId,
          locationId: location.id,
          lotNumber,
          currentQuantity,
          expirationDate,
          isActive: true,
        },
      });
    lotAId = (await createLot(productAId, 'LOT-ACE-01', 50)).id;
    lotBId = (await createLot(productBId, 'LOT-IBU-01', 20)).id;
  }, 30000);

  afterAll(async () => {
    await app.close();
    await cleanTestDatabase();
  });

  function adjust(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/inventory/movements/adjust')
      .set('Cookie', supervisorCookie)
      .send(body);
  }

  const lotQuantity = async (id: string) =>
    (await prisma.inventoryLot.findUniqueOrThrow({ where: { id } })).currentQuantity;

  async function footprint() {
    return {
      lotA: await lotQuantity(lotAId),
      lotB: await lotQuantity(lotBId),
      movements: await prisma.inventoryMovement.count(),
      audits: await prisma.auditEvent.count({ where: { action: 'INVENTORY_MANUAL_ADJUSTMENT' } }),
    };
  }

  describe('correspondencia entre producto y lote (FARM-AUD-004)', () => {
    it('Caso 1: ajusta el lote de su producto con saldo y kardex correctos', async () => {
      const res = await adjust({
        productId: productAId,
        lotId: lotAId,
        adjustmentType: 'INCREMENTO',
        quantityBaseUnits: 10,
        reason: 'Sobrante en conteo físico',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);

      expect(await lotQuantity(lotAId)).toBe(60);
      const movement = await prisma.inventoryMovement.findUniqueOrThrow({
        where: { id: res.body.data.id },
      });
      expect(movement).toMatchObject({
        movementType: 'AJUSTE_POSITIVO',
        productId: productAId,
        lotId: lotAId,
        quantityBaseUnits: 10,
        balanceAfterBaseUnits: 60,
        createdByUserId: supervisorId,
      });
    });

    it('Caso 2: rechaza un producto distinto al dueño del lote sin tocar existencias ni kardex', async () => {
      const before = await footprint();

      const res = await adjust({
        productId: productBId,
        lotId: lotAId,
        adjustmentType: 'DECREMENTO',
        quantityBaseUnits: 5,
        reason: 'Unidades averiadas',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.message).toMatch(/no pertenece al producto/);

      expect(await footprint()).toEqual(before);
    });

    it('rechaza un producto inexistente con un lote real', async () => {
      const before = await footprint();

      const res = await adjust({
        productId: randomUUID(),
        lotId: lotAId,
        adjustmentType: 'INCREMENTO',
        quantityBaseUnits: 5,
        reason: 'Sobrante en conteo',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no pertenece al producto/);
      expect(await footprint()).toEqual(before);
    });

    it('rechaza un lote inexistente', async () => {
      const before = await footprint();

      const res = await adjust({
        productId: productAId,
        lotId: randomUUID(),
        adjustmentType: 'INCREMENTO',
        quantityBaseUnits: 5,
        reason: 'Sobrante en conteo',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/lote especificado no existe/);
      expect(await footprint()).toEqual(before);
    });

    it('la base rechaza un movimiento de kardex cuyo producto no es el del lote', async () => {
      await expect(
        prisma.inventoryMovement.create({
          data: {
            movementType: 'AJUSTE_POSITIVO',
            productId: productBId,
            lotId: lotAId,
            quantityBaseUnits: 1,
            balanceAfterBaseUnits: 51,
            referenceDocumentType: 'LOTE_INICIAL',
            referenceDocumentId: lotAId,
          },
        }),
      ).rejects.toThrow(/inventory_movements_lot_id_product_id_fkey|Foreign key constraint/);
      expect(await prisma.inventoryMovement.count()).toBe(0);
    });
  });

  describe('existencias', () => {
    it('Caso 3: un ajuste negativo dentro del saldo descuenta sin quedar negativo', async () => {
      const res = await adjust({
        productId: productAId,
        lotId: lotAId,
        adjustmentType: 'DECREMENTO',
        quantityBaseUnits: 50,
        reason: 'Producto averiado por humedad',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.data.quantityBaseUnits).toBe(-50);
      expect(res.body.data.balanceAfterBaseUnits).toBe(0);
      expect(await lotQuantity(lotAId)).toBe(0);
    });

    it('Caso 4: rechaza descontar más de lo disponible sin efectos parciales', async () => {
      const before = await footprint();

      const res = await adjust({
        productId: productAId,
        lotId: lotAId,
        adjustmentType: 'DECREMENTO',
        quantityBaseUnits: 51,
        reason: 'Faltante en conteo',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Inventario insuficiente/);
      expect(await footprint()).toEqual(before);
    });
  });

  describe('motivo y observaciones (FARM-AUD-012)', () => {
    it('Caso 5: un motivo de más de 250 caracteres responde 400 sin cambios', async () => {
      const before = await footprint();

      const res = await adjust({
        productId: productAId,
        lotId: lotAId,
        adjustmentType: 'INCREMENTO',
        quantityBaseUnits: 5,
        reason: 'M'.repeat(251),
      });
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.message).toMatch(/motivo.*250/i);
      expect(await footprint()).toEqual(before);
    });

    it('unas observaciones de más de 500 caracteres responden 400 sin cambios', async () => {
      const before = await footprint();

      const res = await adjust({
        productId: productAId,
        lotId: lotAId,
        adjustmentType: 'INCREMENTO',
        quantityBaseUnits: 5,
        reason: 'Sobrante en conteo',
        notes: 'N'.repeat(501),
      });
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.message).toMatch(/observaciones.*500/i);
      expect(await footprint()).toEqual(before);
    });

    it('Caso 6: conserva el motivo completo y las observaciones por separado', async () => {
      const reason =
        `Conteo físico de cierre: ${'diferencia verificada con supervisor '.repeat(7)}`.slice(
          0,
          250,
        );
      expect(reason).toHaveLength(250);

      const res = await adjust({
        productId: productAId,
        lotId: lotAId,
        adjustmentType: 'DECREMENTO',
        quantityBaseUnits: 4,
        reason: `  ${reason}  `,
        notes: 'Acta de conteo 2026-10-12',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);

      const movement = await prisma.inventoryMovement.findUniqueOrThrow({
        where: { id: res.body.data.id },
      });
      expect(movement.reason).toBe(reason);
      expect(movement.notes).toBe('Acta de conteo 2026-10-12');
      expect(movement.referenceDocumentType).toBe('AJUSTE_MANUAL');
      expect(movement.referenceDocumentId).toBeNull();
      expect(res.body.data.reason).toBe(reason);

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'INVENTORY_MANUAL_ADJUSTMENT', entityId: movement.id },
      });
      expect(audit.userId).toBe(supervisorId);
      expect(audit.details).toMatchObject({ reason, productId: productAId, lotId: lotAId });
    });

    it('sin observaciones no copia el motivo en las notas', async () => {
      const res = await adjust({
        productId: productAId,
        lotId: lotAId,
        adjustmentType: 'INCREMENTO',
        quantityBaseUnits: 1,
        reason: 'Sobrante en conteo',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.reason).toBe('Sobrante en conteo');
      expect(res.body.data.notes).toBeNull();
    });
  });

  it('Caso 7: ajustes simultáneos sobre un lote dejan un saldo consistente y nunca negativo', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        adjust({
          productId: productAId,
          lotId: lotAId,
          adjustmentType: 'DECREMENTO',
          quantityBaseUnits: 7,
          reason: 'Retiro por calidad',
        }),
      ),
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(7);
    expect(statuses.filter((s) => s === 400)).toHaveLength(3);
    expect(await lotQuantity(lotAId)).toBe(1);

    const movements = await prisma.inventoryMovement.findMany({
      where: { lotId: lotAId },
      orderBy: { balanceAfterBaseUnits: 'desc' },
    });
    expect(movements.map((m) => m.balanceAfterBaseUnits)).toEqual([43, 36, 29, 22, 15, 8, 1]);
    expect(movements.every((m) => m.quantityBaseUnits === -7 && m.productId === productAId)).toBe(
      true,
    );
  });

  it('Caso 8: el kardex refleja producto, lote, cantidad, usuario y motivo de cada ajuste', async () => {
    await adjust({
      productId: productAId,
      lotId: lotAId,
      adjustmentType: 'INCREMENTO',
      quantityBaseUnits: 10,
      reason: 'Sobrante en conteo',
    }).expect(201);
    await adjust({
      productId: productAId,
      lotId: lotAId,
      adjustmentType: 'DECREMENTO',
      quantityBaseUnits: 4,
      reason: 'Unidades vencidas retiradas',
    }).expect(201);
    await adjust({
      productId: productBId,
      lotId: lotBId,
      adjustmentType: 'DECREMENTO',
      quantityBaseUnits: 2,
      reason: 'Empaque dañado',
    }).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/inventory/movements?lotId=${lotAId}`)
      .set('Cookie', supervisorCookie);
    expect(res.status).toBe(200);
    const items = [...res.body.items].sort(
      (a: { balanceAfterBaseUnits: number }, b: { balanceAfterBaseUnits: number }) =>
        b.balanceAfterBaseUnits - a.balanceAfterBaseUnits,
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      movementType: 'AJUSTE_POSITIVO',
      productId: productAId,
      lotId: lotAId,
      quantityBaseUnits: 10,
      balanceAfterBaseUnits: 60,
      createdByUserId: supervisorId,
      reason: 'Sobrante en conteo',
      product: { id: productAId, name: 'Acetaminofén 500mg' },
      lot: { id: lotAId, lotNumber: 'LOT-ACE-01' },
    });
    expect(items[1]).toMatchObject({
      movementType: 'AJUSTE_NEGATIVO',
      productId: productAId,
      quantityBaseUnits: -4,
      balanceAfterBaseUnits: 56,
      createdByUserId: supervisorId,
      reason: 'Unidades vencidas retiradas',
    });

    const lotB = await prisma.inventoryMovement.findFirstOrThrow({ where: { lotId: lotBId } });
    expect(lotB.productId).toBe(productBId);
    expect(lotB.balanceAfterBaseUnits).toBe(18);
  });

  describe('auditoría del ajuste en la misma transacción', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('si la auditoría falla, no queda saldo, kardex ni evento: el ajuste se revierte entero', async () => {
      // Falla después de guardar el evento: si no usara la transacción del ajuste, quedaría escrito
      const original = auditService.recordEvent.bind(auditService);
      vi.spyOn(auditService, 'recordEvent').mockImplementationOnce(async (input, tx) => {
        await original(input, tx);
        throw new Error('Fallo posterior a la auditoría');
      });
      const before = await footprint();

      const res = await adjust({
        productId: productAId,
        lotId: lotAId,
        adjustmentType: 'DECREMENTO',
        quantityBaseUnits: 5,
        reason: 'Unidades averiadas',
      });
      expect(res.status).toBe(500);

      expect(await footprint()).toEqual(before);
    });

    it('un X-Correlation-Id inválido no rompe el ajuste: la auditoría usa el identificador normalizado', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inventory/movements/adjust')
        .set('Cookie', supervisorCookie)
        .set('X-Correlation-Id', 'x'.repeat(150))
        .send({
          productId: productAId,
          lotId: lotAId,
          adjustmentType: 'INCREMENTO',
          quantityBaseUnits: 2,
          reason: 'Sobrante en conteo',
        });
      expect(res.status, JSON.stringify(res.body)).toBe(201);

      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'INVENTORY_MANUAL_ADJUSTMENT', entityId: res.body.data.id },
      });
      expect(audit.correlationId).toMatch(/^[a-zA-Z0-9_-]{1,100}$/);
      expect(audit.correlationId).not.toBe('x'.repeat(150));
      expect(await lotQuantity(lotAId)).toBe(52);
    });
  });
});
