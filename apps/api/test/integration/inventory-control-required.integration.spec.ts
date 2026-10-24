import { randomUUID } from 'crypto';
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
 * FARM-AUD-002: ningún producto físico puede venderse sin descontar existencias.
 * Mientras no exista un modelo de saldo sin lote (T-09), el catálogo rechaza
 * requiresLotControl=false y la venta rechaza los productos antiguos con esa configuración.
 */
describe('Control de inventario obligatorio en catálogo y ventas (FARM-AUD-002)', () => {
  let app: INestApplication;
  let adminCookie: string;
  let categoryId: string;
  let supplierId: string;
  let locationId: string;

  const inDays = (days: number): string => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const confirmSale = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  const createProduct = (overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        categoryId,
        code: `MED-${randomUUID().slice(0, 8)}`,
        name: 'Acetaminofén 500 mg',
        baseUnit: 'TABLETA',
        basePrice: 200,
        baseCost: 100,
        ...overrides,
      });

  /** Producto antiguo con la configuración incompatible, creado directamente en la base. */
  const createLegacyProductWithStock = async (stock: number) => {
    const product = await prisma.product.create({
      data: {
        categoryId,
        code: `LEG-${randomUUID().slice(0, 8)}`,
        name: 'Caldero 20 cm',
        baseUnit: 'UNIDAD',
        basePrice: new Prisma.Decimal('45000.00'),
        baseCost: new Prisma.Decimal('30000.00'),
        requiresLotControl: false,
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId,
        lotNumber: 'SIN-LOTE-LEGADO',
        expirationDate: new Date(`${inDays(365)}T00:00:00Z`),
        currentQuantity: stock,
      },
    });
    return { product, lot };
  };

  const snapshot = async () => ({
    sales: await prisma.sale.count(),
    saleLines: await prisma.saleLine.count(),
    allocations: await prisma.saleLotAllocation.count(),
    movements: await prisma.inventoryMovement.count(),
    cash: await prisma.cashMovement.count(),
    bank: await prisma.bankMovement.count(),
    receivables: await prisma.receivable.count(),
    journal: await prisma.journalEntry.count(),
    idempotency: await prisma.idempotencyKey.count(),
  });

  beforeAll(async () => {
    await cleanTestDatabase();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    await seedRbac(prisma);
    const provisioning = moduleFixture.get(UserProvisioningService);
    const auth = moduleFixture.get(AuthService);
    const admin = await provisioning.provisionInitialUser({
      username: 'aud002_admin',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    const login = await auth.login('aud002_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;
  }, 30000);

  beforeEach(async () => {
    // Solo los datos de negocio: usuarios, roles y sesión se conservan entre casos
    await prisma.$executeRaw`TRUNCATE TABLE "treasury_documents", "journal_entry_lines", "journal_entries", "company_accounting_mappings", "accounts", "bank_movements", "receivable_payments", "receivables", "payable_payments", "payables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "cash_movements", "customers", "purchase_lines", "purchases", "suppliers", "inventory_movements", "inventory_lots", "locations", "product_presentations", "products", "categories" CASCADE`;
    await prisma.$executeRaw`UPDATE "treasury_document_sequences" SET "last_value" = 0`;

    const accountingMappings = [
      { purpose: 'CASH', code: '110505', type: 'ASSET' },
      { purpose: 'BANK', code: '111005', type: 'ASSET' },
      { purpose: 'CUSTOMERS', code: '130505', type: 'ASSET' },
      { purpose: 'INVENTORY', code: '143501', type: 'ASSET' },
      { purpose: 'SUPPLIERS', code: '220505', type: 'LIABILITY' },
      { purpose: 'VAT_OUTPUT', code: '240805', type: 'LIABILITY' },
      { purpose: 'VAT_INPUT', code: '240810', type: 'ASSET' },
      { purpose: 'SALES_TAXED', code: '413501', type: 'INCOME' },
      { purpose: 'SALES_EXCLUDED', code: '413502', type: 'INCOME' },
      { purpose: 'COST_OF_SALES', code: '613501', type: 'COST' },
    ] as const;
    for (const mapping of accountingMappings) {
      const account = await prisma.account.create({
        data: {
          code: mapping.code,
          name: mapping.purpose,
          type: mapping.type,
          level: 1,
          allowsMovement: true,
          isActive: true,
        },
      });
      await prisma.companyAccountingMapping.create({
        data: {
          purpose: mapping.purpose,
          accountId: account.id,
          status: 'ACTIVE',
          effectiveFrom: new Date('2020-01-01T00:00:00Z'),
        },
      });
    }

    await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final (Cuantías Menores)',
        isDefault: true,
        isActive: true,
      },
    });
    categoryId = (await prisma.category.create({ data: { name: 'Analgésicos' } })).id;
    supplierId = (
      await prisma.supplier.create({ data: { taxId: '900123456-1', name: 'Droguería Mayorista' } })
    ).id;
    locationId = (
      await prisma.location.create({ data: { code: 'BOD-01', name: 'Bodega', isDefault: true } })
    ).id;
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
  });

  describe('catálogo', () => {
    it('Caso 1: rechaza crear un producto con requiresLotControl=false', async () => {
      const response = await createProduct({ requiresLotControl: false });

      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(response.body.message).toMatch(/control de lote/i);
      expect(await prisma.product.count()).toBe(0);
    });

    it.each([
      ['la cadena "false"', 'false'],
      ['el número 0', 0],
      ['null', null],
    ])('rechaza requiresLotControl con %s en lugar de interpretarlo', async (_caso, value) => {
      const response = await createProduct({ requiresLotControl: value });

      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(response.body.message).toMatch(/requiresLotControl/);
      expect(await prisma.product.count()).toBe(0);
    });

    it('rechaza una edición con requiresLotControl="false" sin activar el control de un producto antiguo', async () => {
      const { product } = await createLegacyProductWithStock(0);

      const response = await request(app.getHttpServer())
        .put(`/api/v1/products/${product.id}`)
        .set('Cookie', adminCookie)
        .send({ name: 'Otro nombre', requiresLotControl: 'false' });

      expect(response.status, JSON.stringify(response.body)).toBe(400);
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(stored.requiresLotControl).toBe(false);
      expect(stored.name).toBe('Caldero 20 cm');
    });

    it('crea el producto con control de lote cuando no se indica la configuración', async () => {
      const response = await createProduct();

      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body.requiresLotControl).toBe(true);
    });

    it('Caso 2: rechaza desactivar el control de lote de un producto sin cambios parciales', async () => {
      const created = await createProduct({ name: 'Ibuprofeno 400 mg' });
      expect(created.status).toBe(201);

      const response = await request(app.getHttpServer())
        .put(`/api/v1/products/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ name: 'Ibuprofeno 400 mg (editado)', basePrice: 999, requiresLotControl: false });

      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(response.body.message).toMatch(/control de lote/i);
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(stored.requiresLotControl).toBe(true);
      expect(stored.name).toBe('Ibuprofeno 400 mg');
      expect(stored.basePrice.toFixed(2)).toBe('200.00');
    });

    it('un producto antiguo puede editarse sin activar el control de forma implícita', async () => {
      const { product } = await createLegacyProductWithStock(0);

      const response = await request(app.getHttpServer())
        .put(`/api/v1/products/${product.id}`)
        .set('Cookie', adminCookie)
        .send({ name: 'Caldero 20 cm acero' });

      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(stored.name).toBe('Caldero 20 cm acero');
      expect(stored.requiresLotControl).toBe(false);
    });
  });

  describe('ventas de productos antiguos sin control de lote', () => {
    it('Caso 3: rechaza la venta sin crear venta, kardex, caja ni asientos', async () => {
      const { product, lot } = await createLegacyProductWithStock(5);
      const before = await snapshot();

      const response = await confirmSale({
        paymentMethod: 'EFECTIVO',
        amountPaid: 45000,
        items: [{ productId: product.id, quantityCommercial: 1 }],
      });

      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(response.body.message).toMatch(/Caldero 20 cm/);
      expect(response.body.message).toMatch(/regulari[cz]/i);
      expect(await snapshot()).toEqual(before);
      expect(
        (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })).currentQuantity,
      ).toBe(5);
    });

    it('rechaza la venta a crédito sin abrir cuenta por cobrar', async () => {
      const { product } = await createLegacyProductWithStock(5);
      const customer = await prisma.customer.create({
        data: {
          documentType: 'CC',
          documentNumber: '1030405060',
          name: 'Cliente Crédito',
          isActive: true,
        },
      });
      const before = await snapshot();

      const response = await confirmSale({
        customerId: customer.id,
        paymentMethod: 'CREDITO',
        items: [{ productId: product.id, quantityCommercial: 1 }],
      });

      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(await snapshot()).toEqual(before);
    });

    it('rechaza la venta completa aunque otra línea sí tenga control de lote, sin descuentos parciales', async () => {
      const { product: legacy } = await createLegacyProductWithStock(5);
      const created = await createProduct();
      const tracked = await prisma.inventoryLot.create({
        data: {
          productId: created.body.id,
          locationId,
          lotNumber: 'L-OK',
          expirationDate: new Date(`${inDays(200)}T00:00:00Z`),
          currentQuantity: 50,
        },
      });
      const before = await snapshot();

      const response = await confirmSale({
        paymentMethod: 'EFECTIVO',
        amountPaid: 100000,
        // La línea con control va primero: su descuento FEFO debe revertirse con toda la venta
        items: [
          { productId: created.body.id, quantityCommercial: 10 },
          { productId: legacy.id, quantityCommercial: 1 },
        ],
      });

      expect(response.status, JSON.stringify(response.body)).toBe(400);
      expect(await snapshot()).toEqual(before);
      expect(
        (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: tracked.id } }))
          .currentQuantity,
      ).toBe(50);
    });

    it('al regularizar el producto (activar el control) se vende con FEFO sobre sus lotes', async () => {
      const { product, lot } = await createLegacyProductWithStock(5);

      const regularized = await request(app.getHttpServer())
        .put(`/api/v1/products/${product.id}`)
        .set('Cookie', adminCookie)
        .send({ requiresLotControl: true });
      expect(regularized.status, JSON.stringify(regularized.body)).toBe(200);

      const response = await confirmSale({
        paymentMethod: 'EFECTIVO',
        amountPaid: 90000,
        items: [{ productId: product.id, quantityCommercial: 2 }],
      });

      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(
        (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })).currentQuantity,
      ).toBe(3);
      expect(
        await prisma.inventoryMovement.count({
          where: { productId: product.id, movementType: 'SALIDA_VENTA' },
        }),
      ).toBe(1);
    });
  });

  describe('productos con control de lote (sin regresiones)', () => {
    /** Acetaminofén: blíster = 10 tabletas; caja = 100 blísteres = 1.000 tabletas. */
    const setupAcetaminophen = async (boxes: number) => {
      const created = await createProduct();
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const productId = created.body.id as string;

      const blister = await request(app.getHttpServer())
        .post(`/api/v1/products/${productId}/presentations`)
        .set('Cookie', adminCookie)
        .send({ name: 'Blíster x 10', quantityContained: 10, price: 1800, cost: 900 });
      expect(blister.status, JSON.stringify(blister.body)).toBe(201);

      const box = await request(app.getHttpServer())
        .post(`/api/v1/products/${productId}/presentations`)
        .set('Cookie', adminCookie)
        .send({
          name: 'Caja x 100 blísteres',
          containedPresentationId: blister.body.id,
          quantityContained: 100,
          price: 150000,
          cost: 80000,
        });
      expect(box.status, JSON.stringify(box.body)).toBe(201);
      expect(box.body.conversionFactor).toBe(1000);

      const purchase = await request(app.getHttpServer())
        .post('/api/v1/purchases/receive')
        .set('Cookie', adminCookie)
        .send({
          supplierId,
          invoiceNumber: `FAC-${randomUUID().slice(0, 8)}`,
          purchaseDate: inDays(0),
          lines: [
            {
              productId,
              presentationId: box.body.id,
              lotNumber: 'ACET-2027-01',
              expirationDate: inDays(400),
              quantityCommercial: boxes,
              unitCost: 80000,
            },
          ],
        });
      expect(purchase.status, JSON.stringify(purchase.body)).toBe(201);

      const lot = await prisma.inventoryLot.findFirstOrThrow({ where: { productId } });
      return { productId, blisterId: blister.body.id as string, boxId: box.body.id as string, lot };
    };

    it('Caso 4: compra y venta normal actualizan lote, kardex y asignación FEFO', async () => {
      const { productId, blisterId, lot } = await setupAcetaminophen(1);
      expect(lot.currentQuantity).toBe(1000);

      const response = await confirmSale({
        paymentMethod: 'EFECTIVO',
        amountPaid: 1800,
        items: [{ productId, presentationId: blisterId, quantityCommercial: 1 }],
      });

      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body.status).toBe('COMPLETED');
      expect(
        (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })).currentQuantity,
      ).toBe(990);
      const allocations = await prisma.saleLotAllocation.findMany({
        where: { saleId: response.body.id },
      });
      expect(allocations).toEqual([
        expect.objectContaining({ lotId: lot.id, quantityBaseUnits: 10 }),
      ]);
      const kardex = await prisma.inventoryMovement.findMany({
        where: { productId },
        orderBy: { createdAt: 'asc' },
      });
      expect(
        kardex.map((m) => [m.movementType, m.quantityBaseUnits, m.balanceAfterBaseUnits]),
      ).toEqual([
        ['ENTRADA_COMPRA', 1000, 1000],
        ['SALIDA_VENTA', 10, 990],
      ]);
    });

    it('Caso 5: 1 caja recibida, 3 blísteres y 5 tabletas vendidos dejan 965 tabletas', async () => {
      const { productId, blisterId, boxId, lot } = await setupAcetaminophen(1);

      const blisters = await confirmSale({
        paymentMethod: 'EFECTIVO',
        amountPaid: 5400,
        items: [{ productId, presentationId: blisterId, quantityCommercial: 3 }],
      });
      expect(blisters.status, JSON.stringify(blisters.body)).toBe(201);

      const tablets = await confirmSale({
        paymentMethod: 'EFECTIVO',
        amountPaid: 1000,
        items: [{ productId, quantityCommercial: 5 }],
      });
      expect(tablets.status, JSON.stringify(tablets.body)).toBe(201);

      expect(
        (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })).currentQuantity,
      ).toBe(965);

      const kardex = await prisma.inventoryMovement.findMany({
        where: { productId },
        orderBy: { createdAt: 'asc' },
      });
      expect(
        kardex.map((m) => [
          m.movementType,
          m.presentationId,
          m.presentationFactorHistorical,
          m.quantityBaseUnits,
          m.balanceAfterBaseUnits,
        ]),
      ).toEqual([
        ['ENTRADA_COMPRA', boxId, 1000, 1000, 1000],
        ['SALIDA_VENTA', blisterId, 10, 30, 970],
        ['SALIDA_VENTA', null, 1, 5, 965],
      ]);

      const lines = await prisma.saleLine.findMany({
        where: { productId },
        include: { lotAllocations: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(
        lines.map((l) => [
          l.presentationFactorHistorical,
          l.quantityCommercial.toString(),
          l.quantityBaseUnits,
          l.lotAllocations.map((a) => [a.lotId, a.quantityBaseUnits]),
        ]),
      ).toEqual([
        [10, '3', 30, [[lot.id, 30]]],
        [1, '5', 5, [[lot.id, 5]]],
      ]);
    });

    it('Caso 6: ventas simultáneas no producen saldo negativo ni sobreventa', async () => {
      // 1 caja = 1.000 tabletas; 8 ventas simultáneas de 1 caja: solo una puede despacharse
      const { productId, boxId, lot } = await setupAcetaminophen(1);

      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          confirmSale({
            paymentMethod: 'EFECTIVO',
            amountPaid: 150000,
            items: [{ productId, presentationId: boxId, quantityCommercial: 1 }],
          }),
        ),
      );

      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
      expect(responses.filter((r) => r.status !== 201).every((r) => r.status === 400)).toBe(true);
      expect(
        (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })).currentQuantity,
      ).toBe(0);
      expect(await prisma.sale.count()).toBe(1);
      expect(
        await prisma.inventoryMovement.count({
          where: { productId, movementType: 'SALIDA_VENTA' },
        }),
      ).toBe(1);
    });

    it('Caso 7: la anulación devuelve las unidades al lote original', async () => {
      const { productId, blisterId, lot } = await setupAcetaminophen(1);
      const sale = await confirmSale({
        paymentMethod: 'EFECTIVO',
        amountPaid: 3600,
        items: [{ productId, presentationId: blisterId, quantityCommercial: 2 }],
      });
      expect(sale.status, JSON.stringify(sale.body)).toBe(201);
      expect(
        (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })).currentQuantity,
      ).toBe(980);

      const cancel = await request(app.getHttpServer())
        .post(`/api/v1/sales/${sale.body.id}/cancel`)
        .set('Cookie', adminCookie)
        .send({ reason: 'Error de digitación' });

      expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);
      expect(cancel.body.status).toBe('CANCELLED');
      expect(
        (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })).currentQuantity,
      ).toBe(1000);
      const returned = await prisma.inventoryMovement.findFirstOrThrow({
        where: { productId, movementType: 'DEVOLUCION_CLIENTE' },
      });
      expect([returned.lotId, returned.quantityBaseUnits, returned.balanceAfterBaseUnits]).toEqual([
        lot.id,
        20,
        1000,
      ]);
    });
  });
});
