import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma, seedRbac, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';
import { businessToday } from '../../src/common/utils/business-date';

/**
 * F2 (ADR-005): submayor de costos con promedio ponderado móvil, separado de FEFO, con
 * PostgreSQL real y los flujos HTTP de compra, venta, anulación, notas y ajustes.
 */
describe('Submayor de costos del inventario (PostgreSQL real)', () => {
  let app: INestApplication;
  let cookie: string;
  let adminId: string;
  let supplierId: string;
  let categoryId: string;
  let locationId: string;
  let productId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    const provisioning = module.get(UserProvisioningService);
    const auth = module.get(AuthService);
    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await provisioning.provisionInitialUser({
      username: 'valuation_admin',
      password: 'AdminPassword#2026',
    });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    cookie = `${SESSION_COOKIE_NAME}=${(await auth.login('valuation_admin', 'AdminPassword#2026')).rawToken}`;
  }, 45000);

  beforeEach(async () => {
    // Conserva usuarios y permisos; limpia la operación de la prueba anterior
    await prisma.$executeRaw`TRUNCATE TABLE "inventory_valuation_movements", "inventory_cost_balances", "debit_note_lines", "debit_notes", "credit_note_lines", "credit_notes", "journal_entry_lines", "journal_entries", "company_accounting_mappings", "accounts", "payable_payments", "payables", "receivable_payments", "receivables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "cash_movements", "customers", "purchase_lines", "purchases", "suppliers", "inventory_movements", "inventory_lots", "locations", "product_presentations", "products", "categories", "treasury_documents", "audit_events" CASCADE`;
    await prisma.$executeRaw`UPDATE "treasury_document_sequences" SET "last_value" = 0`;

    const mappings = [
      { purpose: 'CASH', code: '110505', type: 'ASSET' },
      { purpose: 'BANK', code: '111005', type: 'ASSET' },
      { purpose: 'CUSTOMERS', code: '130505', type: 'ASSET' },
      { purpose: 'INVENTORY', code: '143501', type: 'ASSET' },
      { purpose: 'SUPPLIERS', code: '220505', type: 'LIABILITY' },
      { purpose: 'VAT_OUTPUT', code: '240805', type: 'LIABILITY' },
      { purpose: 'VAT_INPUT', code: '240810', type: 'ASSET' },
      { purpose: 'SALES_TAXED', code: '413501', type: 'INCOME' },
      { purpose: 'SALES_EXCLUDED', code: '413502', type: 'INCOME' },
      { purpose: 'SALES_DISCOUNTS', code: '417506', type: 'INCOME' },
      { purpose: 'SALES_RETURNS', code: '417505', type: 'INCOME' },
      { purpose: 'COST_OF_SALES', code: '613501', type: 'COST' },
    ] as const;
    for (const mapping of mappings) {
      const account = await prisma.account.create({
        data: {
          code: mapping.code,
          name: mapping.purpose,
          type: mapping.type,
          level: 1,
          allowsMovement: true,
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

    supplierId = (
      await prisma.supplier.create({ data: { taxId: '900123456-7', name: 'Droguería Mayorista' } })
    ).id;
    categoryId = (await prisma.category.create({ data: { name: 'Medicamentos' } })).id;
    locationId = (
      await prisma.location.create({ data: { code: 'BOD-1', name: 'Bodega', isDefault: true } })
    ).id;
    await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final',
        isDefault: true,
      },
    });
    productId = await createProduct('ACE-500', 0);
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  async function createProduct(code: string, baseCost: number) {
    const product = await prisma.product.create({
      data: {
        inventoryControlMode: 'LOT_EXPIRY',
        categoryId,
        code,
        name: `Producto ${code}`,
        basePrice: 5000,
        baseCost,
      },
    });
    return product.id;
  }

  let invoiceSeq = 0;
  /** Recibe una compra por la API: cada línea es un lote con su vencimiento y su costo. */
  async function receive(
    lines: Array<{ lot: string; quantity: number; unitCost: number; expires?: string }>,
    product = productId,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/purchases/receive')
      .set('Cookie', cookie)
      .send({
        supplierId,
        invoiceNumber: `FAC-${++invoiceSeq}`,
        purchaseDate: businessToday(),
        lines: lines.map((l) => ({
          productId: product,
          lotNumber: l.lot,
          expirationDate: l.expires ?? '2099-01-01',
          quantityCommercial: l.quantity,
          unitCost: l.unitCost,
          locationId,
        })),
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; lines: Array<{ id: string }> };
  }

  function sell(quantity: number, product = productId) {
    return request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        paymentMethod: 'EFECTIVO',
        items: [{ productId: product, quantityCommercial: quantity }],
      });
  }

  async function sold(quantity: number, product = productId) {
    const res = await sell(quantity, product);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; lines: Array<{ id: string; lotAllocations: any[] }> };
  }

  async function balance(product = productId) {
    const b = await prisma.inventoryCostBalance.findUnique({ where: { productId: product } });
    return b ? { quantity: b.quantityBaseUnits, value: b.totalValue.toFixed(2) } : null;
  }

  async function physical(product = productId) {
    const lots = await prisma.inventoryLot.findMany({ where: { productId: product } });
    return lots.reduce((sum, lot) => sum + lot.currentQuantity, 0);
  }

  /** Débito menos crédito de las líneas de un propósito, opcionalmente en un asiento. */
  async function posted(purpose: string, sourceType?: string, sourceId?: string) {
    const lines = await prisma.journalEntryLine.findMany({
      where: {
        purpose: purpose as any,
        journalEntry: {
          status: 'POSTED',
          ...(sourceType ? { sourceType } : {}),
          ...(sourceId ? { sourceId } : {}),
        },
      },
    });
    return lines
      .reduce((t, l) => t.plus(l.debit).minus(l.credit), new Prisma.Decimal(0))
      .toFixed(2);
  }

  it('compras a costos distintos promedian y la venta FEFO sale al costo promedio', async () => {
    await receive([{ lot: 'L-ANTIGUO', quantity: 10, unitCost: 1000, expires: '2098-01-01' }]);
    await receive([{ lot: 'L-NUEVO', quantity: 10, unitCost: 2000, expires: '2099-01-01' }]);
    expect(await balance()).toEqual({ quantity: 20, value: '30000.00' });

    const sale = await sold(4);
    // FEFO elige el lote que vence antes; el costo no es el de ese lote sino el promedio
    expect(sale.lines[0].lotAllocations[0].lotNumber).toBe('L-ANTIGUO');
    const line = await prisma.saleLine.findUniqueOrThrow({ where: { id: sale.lines[0].id } });
    expect(line.costValue?.toFixed(2)).toBe('6000.00');
    expect(line.unitCostBase?.toFixed(2)).toBe('1500.00');
    expect(await posted('COST_OF_SALES', 'SALE', sale.id)).toBe('6000.00');
    expect(await posted('INVENTORY', 'SALE', sale.id)).toBe('-6000.00');
    expect(await balance()).toEqual({ quantity: 16, value: '24000.00' });
  });

  it('una venta que consume varios lotes redondea en centavos y la última salida deja el saldo en cero', async () => {
    await receive([{ lot: 'L1', quantity: 3, unitCost: 1000, expires: '2098-01-01' }]);
    await receive([{ lot: 'L2', quantity: 4, unitCost: 1001, expires: '2099-01-01' }]);
    expect(await balance()).toEqual({ quantity: 7, value: '7004.00' });

    const costs: string[] = [];
    for (const quantity of [1, 5, 1]) {
      const sale = await sold(quantity);
      const line = await prisma.saleLine.findUniqueOrThrow({ where: { id: sale.lines[0].id } });
      costs.push(line.costValue!.toFixed(2));
    }
    // 7004 / 7 = 1000.571...: 1000.57, luego 5/6 del resto y el saldo exacto
    expect(costs).toEqual(['1000.57', '5002.86', '1000.57']);
    expect(await balance()).toEqual({ quantity: 0, value: '0.00' });
    expect(await posted('INVENTORY')).toBe('0.00');
  });

  it('anular una venta devuelve las unidades al costo exacto con que salieron', async () => {
    await receive([{ lot: 'L1', quantity: 10, unitCost: 1000 }]);
    const sale = await sold(4);
    await receive([{ lot: 'L2', quantity: 10, unitCost: 3000 }]);
    expect(await balance()).toEqual({ quantity: 16, value: '36000.00' });

    await request(app.getHttpServer())
      .post(`/api/v1/sales/${sale.id}/cancel`)
      .set('Cookie', cookie)
      .send({ reason: 'Cliente desistió de la compra' })
      .expect(200);

    // Vuelve a 1000 por unidad, no al promedio vigente de 2250
    expect(await balance()).toEqual({ quantity: 20, value: '40000.00' });
    const reentry = await prisma.inventoryValuationMovement.findFirstOrThrow({
      where: { movementType: 'SALE_CANCELLATION' },
    });
    expect(reentry.value.toFixed(2)).toBe('4000.00');
    expect(await posted('COST_OF_SALES')).toBe('0.00');
    expect(await posted('INVENTORY')).toBe('40000.00');
  });

  it('las notas crédito reintegran al costo de salida y la última se lleva el resto exacto', async () => {
    await receive([{ lot: 'L1', quantity: 1, unitCost: 1000, expires: '2098-01-01' }]);
    await receive([{ lot: 'L2', quantity: 2, unitCost: 1001, expires: '2099-01-01' }]);
    const sale = await sold(3);
    const saleLineId = sale.lines[0].id;
    const creditNote = (quantity: number) =>
      request(app.getHttpServer())
        .post(`/api/v1/sales/${sale.id}/credit-notes`)
        .set('Cookie', cookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          reason: 'Devolución del cliente',
          refundMethod: 'EFECTIVO',
          restock: true,
          items: [{ saleLineId, quantityCommercial: quantity }],
        });

    const first = await creditNote(1);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(await balance()).toEqual({ quantity: 1, value: '1000.67' });
    expect(await posted('COST_OF_SALES', 'CREDIT_NOTE', first.body.id)).toBe('-1000.67');

    const second = await creditNote(2);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(await balance()).toEqual({ quantity: 3, value: '3002.00' });
    expect(await posted('COST_OF_SALES')).toBe('0.00');
    expect(await posted('INVENTORY')).toBe('3002.00');
  });

  it('la nota débito sale al promedio y la diferencia con el costo de compra ajusta el costo de ventas', async () => {
    await receive([{ lot: 'L1', quantity: 10, unitCost: 1000 }]);
    const purchase = await receive([{ lot: 'L2', quantity: 10, unitCost: 2000 }]);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.id}/debit-notes`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Mercancía averiada',
        items: [{ purchaseLineId: purchase.lines[0].id, quantityCommercial: 5 }],
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    // El proveedor acredita 10000 (5 × 2000); del submayor salen 5 × 1500
    expect(await balance()).toEqual({ quantity: 15, value: '22500.00' });
    expect(await posted('SUPPLIERS', 'DEBIT_NOTE', res.body.id)).toBe('10000.00');
    expect(await posted('INVENTORY', 'DEBIT_NOTE', res.body.id)).toBe('-7500.00');
    expect(await posted('COST_OF_SALES', 'DEBIT_NOTE', res.body.id)).toBe('-2500.00');
    expect(await posted('INVENTORY')).toBe('22500.00');
  });

  it('ajustes y existencia inicial de un lote se valoran al promedio vigente', async () => {
    await receive([{ lot: 'L1', quantity: 4, unitCost: 1000 }]);
    const lot = await prisma.inventoryLot.findFirstOrThrow({ where: { lotNumber: 'L1' } });
    const adjust = (adjustmentType: 'INCREMENTO' | 'DECREMENTO', quantityBaseUnits: number) =>
      request(app.getHttpServer())
        .post('/api/v1/inventory/movements/adjust')
        .set('Cookie', cookie)
        .send({
          productId,
          lotId: lot.id,
          adjustmentType,
          quantityBaseUnits,
          reason: 'Conteo físico',
        });

    expect((await adjust('INCREMENTO', 2)).status).toBe(201);
    expect(await balance()).toEqual({ quantity: 6, value: '6000.00' });
    expect((await adjust('DECREMENTO', 3)).status).toBe(201);
    expect(await balance()).toEqual({ quantity: 3, value: '3000.00' });

    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory/lots')
      .set('Cookie', cookie)
      .send({
        productId,
        locationId,
        lotNumber: 'L-INICIAL',
        expirationDate: '2099-06-30',
        initialQuantity: 2,
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(await balance()).toEqual({ quantity: 5, value: '5000.00' });
    expect(await physical()).toBe(5);
  });

  it('abre el saldo de existencias anteriores al último costo de compra registrado', async () => {
    // Compra y lote registrados antes de F2: no tienen movimientos de valoración
    const purchase = await prisma.purchase.create({
      data: {
        supplierId,
        invoiceNumber: 'FAC-ANTERIOR',
        purchaseDate: new Date('2026-01-10T00:00:00Z'),
        totalAmount: 7500,
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        controlMode: 'LOT_EXPIRY',
        productId,
        locationId,
        lotNumber: 'L-LEGADO',
        expirationDate: new Date('2099-01-01T00:00:00Z'),
        currentQuantity: 5,
      },
    });
    await prisma.purchaseLine.create({
      data: {
        purchaseId: purchase.id,
        productId,
        lotId: lot.id,
        quantityCommercial: 5,
        quantityBaseUnits: 5,
        unitCost: 1500,
        subtotal: 7500,
        lotNumber: 'L-LEGADO',
        expirationDate: new Date('2099-01-01T00:00:00Z'),
      },
    });

    const sale = await sold(2);
    const opening = await prisma.inventoryValuationMovement.findFirstOrThrow({
      where: { movementType: 'OPENING' },
    });
    expect(opening.quantityBaseUnits).toBe(5);
    expect(opening.value.toFixed(2)).toBe('7500.00');
    expect(opening.sourceType).toBe('AUTO_OPENING');
    expect(opening.sourceId).toBe(`SALE:${sale.id}`);
    const line = await prisma.saleLine.findUniqueOrThrow({ where: { id: sale.lines[0].id } });
    expect(line.costValue?.toFixed(2)).toBe('3000.00');
    expect(await balance()).toEqual({ quantity: 3, value: '4500.00' });
  });

  it('sin compras usa el costo del catálogo y sin ningún costo rechaza la venta sin dejar efectos', async () => {
    const withCatalogCost = await createProduct('CAT-800', 800);
    const withoutCost = await createProduct('SIN-COSTO', 0);
    for (const [product, lotNumber] of [
      [withCatalogCost, 'L-CAT'],
      [withoutCost, 'L-SIN'],
    ]) {
      await prisma.inventoryLot.create({
        data: {
          controlMode: 'LOT_EXPIRY',
          productId: product,
          locationId,
          lotNumber,
          expirationDate: new Date('2099-01-01T00:00:00Z'),
          currentQuantity: 5,
        },
      });
    }

    await sold(2, withCatalogCost);
    expect(await balance(withCatalogCost)).toEqual({ quantity: 3, value: '2400.00' });

    const rejected = await sell(2, withoutCost);
    expect(rejected.status).toBe(409);
    expect(rejected.body.message).toMatch(/sin costo conocido/);
    expect(await physical(withoutCost)).toBe(5);
    expect(await balance(withoutCost)).toBeNull();
    expect(await prisma.sale.count()).toBe(1);
  });

  it('detiene la operación si las existencias de los lotes no coinciden con el saldo valorizado', async () => {
    await receive([{ lot: 'L1', quantity: 5, unitCost: 1000 }]);
    // Existencias que no entraron por ningún flujo de la aplicación
    await prisma.inventoryLot.create({
      data: {
        controlMode: 'LOT_EXPIRY',
        productId,
        locationId,
        lotNumber: 'L-FUERA',
        expirationDate: new Date('2099-01-01T00:00:00Z'),
        currentQuantity: 3,
      },
    });
    const res = await sell(1);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no coinciden con el inventario valorizado/);
    expect(await balance()).toEqual({ quantity: 5, value: '5000.00' });
    expect(await prisma.sale.count()).toBe(0);
  });

  it('concilia unidades y valor: inicial + entradas − salidas = final, con lotes y con el mayor', async () => {
    await receive([{ lot: 'L1', quantity: 10, unitCost: 1000, expires: '2098-01-01' }]);
    const purchase = await receive([{ lot: 'L2', quantity: 10, unitCost: 1300 }]);
    const sale = await sold(7);
    await sold(2);
    await request(app.getHttpServer())
      .post(`/api/v1/sales/${sale.id}/credit-notes`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Devolución parcial',
        refundMethod: 'EFECTIVO',
        restock: true,
        items: [{ saleLineId: sale.lines[0].id, quantityCommercial: 3 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/purchases/${purchase.id}/debit-notes`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Devolución',
        items: [{ purchaseLineId: purchase.lines[0].id, quantityCommercial: 4 }],
      })
      .expect(201);

    const movements = await prisma.inventoryValuationMovement.findMany({ where: { productId } });
    let quantity = 0;
    let value = new Prisma.Decimal(0);
    for (const m of movements) {
      const sign = m.direction === 'IN' ? 1 : -1;
      quantity += sign * m.quantityBaseUnits;
      value = value.plus(m.value.mul(sign));
    }
    const final = await balance();
    expect(quantity).toBe(final!.quantity);
    expect(value.toFixed(2)).toBe(final!.value);
    expect(await physical()).toBe(final!.quantity);
    // Sin ajustes (su asiento es F6), el inventario del mayor coincide con el submayor
    expect(await posted('INVENTORY')).toBe(final!.value);
  });

  it('ventas simultáneas del mismo producto no pierden ni duplican costo', async () => {
    await receive([{ lot: 'L1', quantity: 10, unitCost: 1003 }]);
    const results = await Promise.all(Array.from({ length: 5 }, () => sell(2)));
    for (const res of results) expect(res.status, JSON.stringify(res.body)).toBe(201);

    const lines = await prisma.saleLine.findMany();
    const total = lines.reduce((t, l) => t.plus(l.costValue!), new Prisma.Decimal(0));
    expect(total.toFixed(2)).toBe('10030.00');
    expect(await balance()).toEqual({ quantity: 0, value: '0.00' });
    expect(await prisma.inventoryValuationMovement.count({ where: { direction: 'OUT' } })).toBe(5);
  });

  it('el submayor es de solo inserción', async () => {
    await receive([{ lot: 'L1', quantity: 2, unitCost: 1000 }]);
    const movement = await prisma.inventoryValuationMovement.findFirstOrThrow();
    await expect(
      prisma.$executeRaw`UPDATE inventory_valuation_movements SET value = 0 WHERE id = ${movement.id}::uuid`,
    ).rejects.toThrow(/inmutable/);
    await expect(
      prisma.$executeRaw`DELETE FROM inventory_valuation_movements WHERE id = ${movement.id}::uuid`,
    ).rejects.toThrow(/inmutable/);
  });

  it('el reporte de inventario valorizado usa el costo promedio del submayor', async () => {
    await receive([{ lot: 'L1', quantity: 10, unitCost: 1000 }]);
    await receive([{ lot: 'L2', quantity: 10, unitCost: 2000 }]);
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/inventory-valuation')
      .set('Cookie', cookie)
      .expect(200);
    const item = res.body.data.items.find((i: { productId: string }) => i.productId === productId);
    expect(item).toMatchObject({
      costSource: 'VALUATION',
      baseCost: 1500,
      totalCostValue: 30000,
      currentStock: 20,
    });
  });
});
