import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { cleanTestDatabase, Prisma, prisma, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('F4: modos de control de catálogo e inventario (PostgreSQL)', () => {
  let app: INestApplication;
  let adminCookie: string;
  let categoryId: string;
  let supplierId: string;
  let locationId: string;

  const today = () => new Date().toISOString().slice(0, 10);
  const inDays = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const createProduct = async (
    inventoryControlMode?: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Cookie', adminCookie)
      .send({
        categoryId,
        code: `F4-${randomUUID().slice(0, 10)}`,
        name: 'Producto F4',
        baseUnit: 'UNIDAD',
        basePrice: 100,
        baseCost: 20,
        ...(inventoryControlMode ? { inventoryControlMode } : {}),
        ...overrides,
      });
    return response;
  };

  const receive = (
    productId: string,
    mode: 'LOT_EXPIRY' | 'LOT' | 'SIMPLE' | 'SERIAL',
    options: {
      quantity?: number;
      lotNumber?: string;
      expirationDate?: string | null;
      serialNumbers?: string[];
      invoiceNumber?: string;
      locationId?: string;
      presentationId?: string;
    } = {},
  ) => {
    const line: Record<string, unknown> = {
      productId,
      quantityCommercial:
        options.quantity ?? (mode === 'SERIAL' ? (options.serialNumbers?.length ?? 1) : 1),
      unitCost: 20,
      locationId: options.locationId ?? locationId,
      ...(options.presentationId ? { presentationId: options.presentationId } : {}),
    };
    if (mode === 'LOT_EXPIRY') {
      line.lotNumber = options.lotNumber ?? `LOT-${randomUUID().slice(0, 8)}`;
      line.expirationDate =
        options.expirationDate === null ? null : (options.expirationDate ?? inDays(120));
    } else if (mode === 'LOT') {
      line.lotNumber = options.lotNumber ?? `LOT-${randomUUID().slice(0, 8)}`;
      if (options.expirationDate) line.expirationDate = options.expirationDate;
    } else if (mode === 'SERIAL') {
      line.serialNumbers = options.serialNumbers ?? [`SER-${randomUUID().slice(0, 8)}`];
    }
    return request(app.getHttpServer())
      .post('/api/v1/purchases/receive')
      .set('Cookie', adminCookie)
      .send({
        supplierId,
        invoiceNumber: options.invoiceNumber ?? `F4-${randomUUID()}`,
        purchaseDate: today(),
        lines: [line],
      });
  };

  const confirmSale = (items: Array<Record<string, unknown>>, key = randomUUID()) =>
    request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', key)
      .send({
        paymentMethod: 'EFECTIVO',
        amountPaid: items.reduce((sum, item) => sum + Number(item.quantityCommercial) * 100, 0),
        items,
      });

  const snapshot = async () => ({
    sales: await prisma.sale.count(),
    saleLines: await prisma.saleLine.count(),
    allocations: await prisma.saleLotAllocation.count(),
    movements: await prisma.inventoryMovement.count(),
    valuationMovements: await prisma.inventoryValuationMovement.count(),
    cash: await prisma.cashMovement.count(),
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
      username: 'f4_admin',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    const login = await auth.login('f4_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;
  }, 30_000);

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "treasury_documents", "journal_entry_lines", "journal_entries", "company_accounting_mappings", "accounts", "bank_movements", "receivable_payments", "receivables", "payable_payments", "payables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "cash_movements", "customers", "purchase_lines", "purchases", "suppliers", "inventory_valuation_movements", "inventory_cost_balances", "inventory_movements", "inventory_alerts", "locations", "product_presentations", "products", "categories" CASCADE`;
    await prisma.$executeRaw`UPDATE "treasury_document_sequences" SET "last_value" = 0`;

    const mappings = [
      ['CASH', '110505', 'ASSET'],
      ['BANK', '111005', 'ASSET'],
      ['CUSTOMERS', '130505', 'ASSET'],
      ['INVENTORY', '143501', 'ASSET'],
      ['SUPPLIERS', '220505', 'LIABILITY'],
      ['VAT_OUTPUT', '240805', 'LIABILITY'],
      ['VAT_INPUT', '240810', 'ASSET'],
      ['SALES_TAXED', '413501', 'INCOME'],
      ['SALES_EXCLUDED', '413502', 'INCOME'],
      ['SALES_DISCOUNTS', '417501', 'INCOME'],
      ['SALES_RETURNS', '417505', 'INCOME'],
      ['COST_OF_SALES', '613501', 'COST'],
    ] as const;
    for (const [purpose, code, type] of mappings) {
      const account = await prisma.account.create({
        data: { code, name: purpose, type, level: 1, allowsMovement: true, isActive: true },
      });
      await prisma.companyAccountingMapping.create({
        data: {
          purpose,
          accountId: account.id,
          status: 'ACTIVE',
          effectiveFrom: new Date('2020-01-01'),
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
    categoryId = (await prisma.category.create({ data: { name: 'Categoría F4' } })).id;
    supplierId = (
      await prisma.supplier.create({ data: { taxId: '900123456-1', name: 'Proveedor F4' } })
    ).id;
    locationId = (
      await prisma.location.create({
        data: { code: 'F4-BOD', name: 'Bodega F4', isDefault: true },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
  });

  it('aplica perfil PHARMACY, expone settings y valida el modo de prescripción', async () => {
    const settings = await request(app.getHttpServer())
      .get('/api/v1/products/settings')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(settings.body).toEqual({
      sectorProfile: 'PHARMACY',
      defaultControlMode: 'LOT_EXPIRY',
      allowedControlModes: ['SERVICE', 'SIMPLE', 'LOT', 'LOT_EXPIRY', 'SERIAL'],
      prescriptionRequiredControlMode: 'LOT_EXPIRY',
    });
    const defaultProduct = await createProduct();
    expect(defaultProduct.status, JSON.stringify(defaultProduct.body)).toBe(201);
    expect(defaultProduct.body.inventoryControlMode).toBe('LOT_EXPIRY');
    const serialProduct = await createProduct('SERIAL');
    expect(serialProduct.status, JSON.stringify(serialProduct.body)).toBe(201);
    expect(serialProduct.body.inventoryControlMode).toBe('SERIAL');
    await createProduct('SIMPLE', { prescriptionRequired: true }).then((res) => {
      expect(res.status, JSON.stringify(res.body)).toBe(400);
    });
    const prescribed = await createProduct('LOT_EXPIRY', { prescriptionRequired: true });
    expect(prescribed.status, JSON.stringify(prescribed.body)).toBe(201);
    const edit = await request(app.getHttpServer())
      .put(`/api/v1/products/${prescribed.body.id}`)
      .set('Cookie', adminCookie)
      .send({ inventoryControlMode: 'LOT' })
      .expect(400);
    expect(edit.body.message).toMatch(/fórmula médica/i);
  });

  it('filtra productos por modo y bloquea el cambio con existencias; lo permite sin ellas', async () => {
    const empty = await createProduct('SIMPLE');
    const changed = await request(app.getHttpServer())
      .put(`/api/v1/products/${empty.body.id}`)
      .set('Cookie', adminCookie)
      .send({ inventoryControlMode: 'SERIAL' })
      .expect(200);
    expect(changed.body.inventoryControlMode).toBe('SERIAL');

    const stocked = await createProduct('SIMPLE');
    await receive(stocked.body.id, 'SIMPLE', { quantity: 3 }).expect(201);
    const conflict = await request(app.getHttpServer())
      .put(`/api/v1/products/${stocked.body.id}`)
      .set('Cookie', adminCookie)
      .send({ inventoryControlMode: 'LOT' })
      .expect(409);
    expect(conflict.body.message).toMatch(/existencias registradas/i);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: stocked.body.id } }))
        .inventoryControlMode,
    ).toBe('SIMPLE');

    const list = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Cookie', adminCookie)
      .query({ inventoryControlMode: 'SIMPLE' })
      .expect(200);
    expect(
      list.body.items.every(
        (product: { inventoryControlMode: string }) => product.inventoryControlMode === 'SIMPLE',
      ),
    ).toBe(true);
  });

  it('recibe SIMPLE, LOT, LOT_EXPIRY y SERIAL según el producto y rechaza formas incompatibles', async () => {
    const simple = await createProduct('SIMPLE');
    const firstSimple = await receive(simple.body.id, 'SIMPLE', { quantity: 2 }).expect(201);
    const secondSimple = await receive(simple.body.id, 'SIMPLE', { quantity: 3 }).expect(201);
    expect(firstSimple.body.lines).toHaveLength(1);
    expect(secondSimple.body.lines[0].lotNumber).toBeNull();
    const simpleBalance = await prisma.inventoryLot.findFirstOrThrow({
      where: { productId: simple.body.id },
    });
    expect(simpleBalance).toMatchObject({
      lotNumber: null,
      expirationDate: null,
      currentQuantity: 5,
      controlMode: 'SIMPLE',
    });
    await receive(simple.body.id, 'LOT', { lotNumber: 'NO-SIMPLE' }).expect(400);

    const lot = await createProduct('LOT');
    await receive(lot.body.id, 'LOT', { lotNumber: 'LOT-SIN-FECHA' }).expect(201);
    expect(
      await prisma.inventoryLot.findFirstOrThrow({ where: { productId: lot.body.id } }),
    ).toMatchObject({ lotNumber: 'LOT-SIN-FECHA', expirationDate: null, controlMode: 'LOT' });
    await receive(lot.body.id, 'LOT', {
      lotNumber: 'LOT-INVALIDO',
      expirationDate: inDays(30),
    }).expect(400);

    const expiry = await createProduct('LOT_EXPIRY');
    await receive(expiry.body.id, 'LOT_EXPIRY', {
      lotNumber: 'EXP-INVALIDO',
      expirationDate: null,
    }).expect(400);
    await receive(expiry.body.id, 'LOT_EXPIRY', {
      lotNumber: 'EXP-OK',
      expirationDate: inDays(30),
    }).expect(201);
    await receive(expiry.body.id, 'LOT_EXPIRY', {
      lotNumber: 'EXP-VENCIDO',
      expirationDate: inDays(-1),
    }).expect(400);

    const serial = await createProduct('SERIAL');
    await receive(serial.body.id, 'SERIAL', { serialNumbers: ['S-A', 'S-B'], quantity: 2 }).expect(
      201,
    );
    expect(await prisma.purchaseLine.count({ where: { productId: serial.body.id } })).toBe(2);
    await receive(serial.body.id, 'SERIAL', { serialNumbers: ['S-C'], quantity: 2 }).expect(400);
    await receive(serial.body.id, 'SERIAL', { serialNumbers: ['S-D', 'S-D'], quantity: 2 }).expect(
      400,
    );
    await receive(serial.body.id, 'SERIAL', { serialNumbers: ['S-A'] }).expect(409);
    const serialPresentation = await prisma.productPresentation.create({
      data: { productId: serial.body.id, name: 'Caja serial x2', conversionFactor: 2, price: 40 },
    });
    await receive(serial.body.id, 'SERIAL', {
      serialNumbers: ['S-FACTOR-1', 'S-FACTOR-2'],
      quantity: 1,
      presentationId: serialPresentation.id,
    }).expect(400);

    const service = await createProduct('SERVICE');
    await receive(service.body.id, 'LOT_EXPIRY').expect(400);
  });

  it('valida existencias manuales según el modo vigente del producto', async () => {
    const simple = await createProduct('SIMPLE');
    await request(app.getHttpServer())
      .post('/api/v1/inventory/lots')
      .set('Cookie', adminCookie)
      .send({ productId: simple.body.id, locationId, initialQuantity: 0 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/inventory/lots')
      .set('Cookie', adminCookie)
      .send({ productId: simple.body.id, locationId, initialQuantity: 0 })
      .expect(409);

    const serial = await createProduct('SERIAL');
    await request(app.getHttpServer())
      .post('/api/v1/inventory/lots')
      .set('Cookie', adminCookie)
      .send({ productId: serial.body.id, locationId, lotNumber: 'SER-MANUAL', initialQuantity: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/inventory/lots')
      .set('Cookie', adminCookie)
      .send({
        productId: serial.body.id,
        locationId,
        lotNumber: 'SER-MANUAL-2',
        initialQuantity: 2,
      })
      .expect(400);

    const service = await createProduct('SERVICE');
    await request(app.getHttpServer())
      .post('/api/v1/inventory/lots')
      .set('Cookie', adminCookie)
      .send({ productId: service.body.id, locationId })
      .expect(400);
  });

  it('respeta orden de entrada para SIMPLE y LOT, FEFO para LOT_EXPIRY y excluye vencidos', async () => {
    const simple = await createProduct('SIMPLE');
    await receive(simple.body.id, 'SIMPLE', { quantity: 5 });
    await confirmSale([
      { productId: simple.body.id, quantityCommercial: 1, serialNumbers: ['NO-SERIAL'] },
    ]).expect(400);
    const simpleSale = await confirmSale([
      { productId: simple.body.id, quantityCommercial: 1 },
    ]).expect(201);
    const simpleLot = await prisma.inventoryLot.findFirstOrThrow({
      where: { productId: simple.body.id },
    });
    expect(
      await prisma.saleLotAllocation.findFirstOrThrow({ where: { saleId: simpleSale.body.id } }),
    ).toMatchObject({ lotId: simpleLot.id, quantityBaseUnits: 1 });

    const lotProduct = await createProduct('LOT');
    const first = await receive(lotProduct.body.id, 'LOT', {
      lotNumber: 'ENTRADA-1',
      quantity: 2,
    }).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await receive(lotProduct.body.id, 'LOT', {
      lotNumber: 'ENTRADA-2',
      quantity: 2,
    }).expect(201);
    const lotSale = await confirmSale([
      { productId: lotProduct.body.id, quantityCommercial: 1 },
    ]).expect(201);
    const lotLines = await prisma.purchaseLine.findMany({
      where: { purchaseId: { in: [first.body.id, second.body.id] } },
    });
    const firstLotId = lotLines.find((line) => line.lotNumber === 'ENTRADA-1')!.lotId;
    expect(
      await prisma.saleLotAllocation.findFirstOrThrow({ where: { saleId: lotSale.body.id } }),
    ).toMatchObject({ lotId: firstLotId });

    const expiry = await createProduct('LOT_EXPIRY');
    const near = await receive(expiry.body.id, 'LOT_EXPIRY', {
      lotNumber: 'FEFO-NEAR',
      expirationDate: inDays(30),
      quantity: 2,
    }).expect(201);
    await receive(expiry.body.id, 'LOT_EXPIRY', {
      lotNumber: 'FEFO-FAR',
      expirationDate: inDays(90),
      quantity: 2,
    }).expect(201);
    const nearLine = await prisma.purchaseLine.findFirstOrThrow({
      where: { purchaseId: near.body.id },
    });
    await prisma.inventoryLot.update({
      where: { id: nearLine.lotId },
      data: { expirationDate: new Date(`${inDays(-1)}T00:00:00Z`) },
    });
    const expirySale = await confirmSale([
      { productId: expiry.body.id, quantityCommercial: 1 },
    ]).expect(201);
    const farLine = await prisma.purchaseLine.findFirstOrThrow({
      where: { productId: expiry.body.id, lotNumber: 'FEFO-FAR' },
    });
    expect(
      await prisma.saleLotAllocation.findFirstOrThrow({ where: { saleId: expirySale.body.id } }),
    ).toMatchObject({ lotId: farLine.lotId });
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: nearLine.lotId } }))
        .currentQuantity,
    ).toBe(2);

    const onlyExpired = await createProduct('LOT_EXPIRY');
    const expiredPurchase = await receive(onlyExpired.body.id, 'LOT_EXPIRY', {
      lotNumber: 'ONLY-EXPIRED',
      expirationDate: inDays(30),
      quantity: 1,
    }).expect(201);
    const expiredLine = await prisma.purchaseLine.findFirstOrThrow({
      where: { purchaseId: expiredPurchase.body.id },
    });
    await prisma.inventoryLot.update({
      where: { id: expiredLine.lotId },
      data: { expirationDate: new Date(`${inDays(-1)}T00:00:00Z`) },
    });
    await confirmSale([{ productId: onlyExpired.body.id, quantityCommercial: 1 }]).expect(400);
  });

  it('vende SERVICE sin existencias, kardex ni costo y contabiliza el asiento balanceado', async () => {
    const service = await createProduct('SERVICE');
    const preview = await request(app.getHttpServer())
      .post('/api/v1/sales/fefo-preview')
      .set('Cookie', adminCookie)
      .send({ items: [{ productId: service.body.id, quantityCommercial: 1 }] })
      .expect(200);
    expect(preview.body.lines[0]).toMatchObject({ shortfallBaseUnits: 0, allocations: [] });
    const before = await snapshot();
    const result = await confirmSale([
      { productId: service.body.id, quantityCommercial: 1 },
    ]).expect(201);
    const line = await prisma.saleLine.findFirstOrThrow({ where: { saleId: result.body.id } });
    expect(line.unitCostBase?.toFixed(2)).toBe('0.00');
    expect(line.costValue?.toFixed(2)).toBe('0.00');
    expect(await prisma.inventoryMovement.count({ where: { productId: service.body.id } })).toBe(0);
    expect(await prisma.saleLotAllocation.count({ where: { saleLineId: line.id } })).toBe(0);
    expect((await snapshot()).movements).toBe(before.movements);
    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { sourceType_sourceId: { sourceType: 'SALE', sourceId: result.body.id } },
      include: { lines: true },
    });
    const debits = journal.lines.reduce(
      (sum, entry) => sum.plus(entry.debit),
      new Prisma.Decimal(0),
    );
    const credits = journal.lines.reduce(
      (sum, entry) => sum.plus(entry.credit),
      new Prisma.Decimal(0),
    );
    expect(debits.equals(credits)).toBe(true);
    expect(journal.lines.some((entry) => entry.purpose === 'COST_OF_SALES')).toBe(false);
  });

  it('valida SERIAL al vender, entrega availableSerials y rechaza series faltantes, duplicadas, ajenas o vendidas', async () => {
    const product = await createProduct('SERIAL');
    await receive(product.body.id, 'SERIAL', {
      serialNumbers: ['SER-1', 'SER-2'],
      quantity: 2,
    }).expect(201);
    // Sin series: el POS consulta las disponibles en orden de entrada para elegirlas
    const lookup = await request(app.getHttpServer())
      .post('/api/v1/sales/fefo-preview')
      .set('Cookie', adminCookie)
      .send({ items: [{ productId: product.body.id, quantityCommercial: 3 }] })
      .expect(200);
    expect(lookup.body.lines[0]).toMatchObject({
      availableSerials: ['SER-1', 'SER-2'],
      availableBaseUnits: 2,
      shortfallBaseUnits: 1,
      allocations: [],
    });

    const preview = await request(app.getHttpServer())
      .post('/api/v1/sales/fefo-preview')
      .set('Cookie', adminCookie)
      .send({
        items: [
          { productId: product.body.id, quantityCommercial: 2, serialNumbers: ['SER-2', 'SER-1'] },
        ],
      })
      .expect(200);
    expect(preview.body.lines[0].availableSerials).toEqual(['SER-1', 'SER-2']);
    expect(
      preview.body.lines[0].allocations.map((a: { lotNumber: string }) => a.lotNumber),
    ).toEqual(['SER-2', 'SER-1']);

    await confirmSale([{ productId: product.body.id, quantityCommercial: 1 }]).expect(400);
    await confirmSale([
      { productId: product.body.id, quantityCommercial: 2, serialNumbers: ['SER-1'] },
    ]).expect(400);
    await confirmSale([
      { productId: product.body.id, quantityCommercial: 2, serialNumbers: ['SER-1', 'SER-1'] },
    ]).expect(400);
    const foreignProduct = await createProduct('SERIAL');
    await confirmSale([
      { productId: foreignProduct.body.id, quantityCommercial: 1, serialNumbers: ['SER-1'] },
    ]).expect(409);

    await receive(product.body.id, 'SERIAL', { serialNumbers: ['SER-INACTIVE'] }).expect(201);
    await prisma.inventoryLot.updateMany({
      where: { productId: product.body.id, lotNumber: 'SER-INACTIVE' },
      data: { isActive: false },
    });
    await confirmSale([
      { productId: product.body.id, quantityCommercial: 1, serialNumbers: ['SER-INACTIVE'] },
    ]).expect(409);

    const sale = await confirmSale([
      { productId: product.body.id, quantityCommercial: 1, serialNumbers: ['SER-1'] },
    ]).expect(201);
    const allocation = await prisma.saleLotAllocation.findFirstOrThrow({
      where: { saleId: sale.body.id },
    });
    const serialLot = await prisma.inventoryLot.findUniqueOrThrow({
      where: { id: allocation.lotId },
    });
    expect(serialLot).toMatchObject({
      lotNumber: 'SER-1',
      currentQuantity: 0,
      controlMode: 'SERIAL',
    });
    await confirmSale([
      { productId: product.body.id, quantityCommercial: 1, serialNumbers: ['SER-1'] },
    ]).expect(409);
  });

  it('solo una de dos ventas concurrentes confirma la misma serie', async () => {
    const product = await createProduct('SERIAL');
    await receive(product.body.id, 'SERIAL', { serialNumbers: ['SER-RACE'] }).expect(201);
    const item = [
      { productId: product.body.id, quantityCommercial: 1, serialNumbers: ['SER-RACE'] },
    ];
    const results = await Promise.all([
      confirmSale(item, randomUUID()),
      confirmSale(item, randomUUID()),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.sale.count()).toBe(1);
    expect(
      await prisma.inventoryMovement.count({
        where: { productId: product.body.id, movementType: 'SALIDA_VENTA' },
      }),
    ).toBe(1);
    expect(
      (await prisma.inventoryLot.findFirstOrThrow({ where: { productId: product.body.id } }))
        .currentQuantity,
    ).toBe(0);
  });

  it('emite notas crédito SERVICE sin reingreso y SERIAL en su misma existencia', async () => {
    const service = await createProduct('SERVICE');
    const serviceSale = await confirmSale([
      { productId: service.body.id, quantityCommercial: 1 },
    ]).expect(201);
    const serviceLine = serviceSale.body.lines[0];
    const serviceNote = await request(app.getHttpServer())
      .post(`/api/v1/sales/${serviceSale.body.id}/credit-notes`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Devolución de servicio',
        items: [{ saleLineId: serviceLine.id, quantityCommercial: 1 }],
      })
      .expect(201);
    expect(serviceNote.body.lines[0]).toMatchObject({
      lotId: null,
      lotNumber: null,
      expirationDate: null,
    });
    expect(await prisma.inventoryMovement.count({ where: { productId: service.body.id } })).toBe(0);

    const serial = await createProduct('SERIAL');
    await receive(serial.body.id, 'SERIAL', { serialNumbers: ['SER-RETURN'] }).expect(201);
    const sale = await confirmSale([
      { productId: serial.body.id, quantityCommercial: 1, serialNumbers: ['SER-RETURN'] },
    ]).expect(201);
    const sourceAllocation = await prisma.saleLotAllocation.findFirstOrThrow({
      where: { saleId: sale.body.id },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/sales/${sale.body.id}/credit-notes`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Reingreso de serie',
        items: [{ saleLineId: sale.body.lines[0].id, quantityCommercial: 1 }],
      })
      .expect(201);
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: sourceAllocation.lotId } }))
        .currentQuantity,
    ).toBe(1);
  });

  it('no alerta saldos SIMPLE y permite nota débito sobre compra sin lote', async () => {
    const product = await createProduct('SIMPLE');
    const purchase = await receive(product.body.id, 'SIMPLE', { quantity: 4 }).expect(201);
    const evaluation = await request(app.getHttpServer())
      .post('/api/v1/alerts/evaluate')
      .set('Cookie', adminCookie)
      .send({ referenceDate: today() })
      .expect(200);
    expect(evaluation.body.data.evaluatedLots).toBe(0);
    expect(await prisma.inventoryAlert.count({ where: { productId: product.body.id } })).toBe(0);

    const line = await prisma.purchaseLine.findFirstOrThrow({
      where: { purchaseId: purchase.body.id },
    });
    const note = await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.body.id}/debit-notes`)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Devolución saldo sin lote',
        items: [{ purchaseLineId: line.id, quantityCommercial: 1 }],
      })
      .expect(201);
    expect(note.body.lines[0]).toMatchObject({ lotNumber: null, expirationDate: null });
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: line.lotId } })).currentQuantity,
    ).toBe(3);
  });

  it('revierte todos los cambios de la venta si falla una línea posterior', async () => {
    const stocked = await createProduct('LOT');
    const empty = await createProduct('LOT');
    await receive(stocked.body.id, 'LOT', { lotNumber: 'ROLLBACK-LOT', quantity: 2 }).expect(201);
    const before = await snapshot();
    const result = await confirmSale([
      { productId: stocked.body.id, quantityCommercial: 1 },
      { productId: empty.body.id, quantityCommercial: 1 },
    ]);
    expect(result.status).toBe(400);
    expect(await snapshot()).toEqual(before);
    expect(
      (await prisma.inventoryLot.findFirstOrThrow({ where: { productId: stocked.body.id } }))
        .currentQuantity,
    ).toBe(2);
  });
});
