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
 * F5 (ADR-006): costeo configurable por empresa. PEPS consume las capas más antiguas del
 * producto, el costo identificado las de la existencia de la que sale y el cambio de método
 * convierte cada saldo sin cambiar el valor total. PostgreSQL real y flujos HTTP.
 */
describe('Costeo configurable: PEPS, costo identificado y cambio de método', () => {
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
      username: 'costing_admin',
      password: 'AdminPassword#2026',
    });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    cookie = `${SESSION_COOKIE_NAME}=${(await auth.login('costing_admin', 'AdminPassword#2026')).rawToken}`;
  }, 45000);

  beforeEach(async () => {
    // Conserva usuarios y permisos; limpia la operación de la prueba anterior
    await prisma.$executeRaw`TRUNCATE TABLE "company_accounting_policies", "branches", "companies", "inventory_valuation_movements", "inventory_cost_balances", "debit_note_lines", "debit_notes", "credit_note_lines", "credit_notes", "journal_entry_lines", "journal_entries", "company_accounting_mappings", "accounts", "payable_payments", "payables", "receivable_payments", "receivables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "cash_movements", "customers", "purchase_lines", "purchases", "suppliers", "inventory_movements", "inventory_lots", "locations", "product_presentations", "products", "categories", "treasury_documents", "audit_events" CASCADE`;
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

  async function setPolicy(costingMethod: string, effectiveFrom: string) {
    let company = await prisma.company.findFirst();
    if (!company) {
      company = await prisma.company.create({
        data: {
          legalName: 'Droguería de Prueba SAS',
          taxId: '900123456',
          taxIdCheckDigit: '8',
          sectorProfile: 'PHARMACY',
        },
      });
    }
    return prisma.companyAccountingPolicy.create({
      data: {
        companyId: company.id,
        effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`),
        costingMethod,
        openingCostSource: 'LAST_PURCHASE_THEN_CATALOG',
        purchaseReturnVariancePurpose: 'COST_OF_SALES',
        bonusUnitsTreatment: 'ZERO_COST_IN_AVERAGE',
        reason: `Prueba ${costingMethod}`,
      },
    });
  }

  const yesterday = () => {
    const date = new Date(`${businessToday()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  };

  async function costOf(saleId: string) {
    const line = await prisma.saleLine.findFirstOrThrow({ where: { saleId } });
    return line.costValue?.toFixed(2);
  }

  async function openLayers(product = productId) {
    const layers = await prisma.inventoryCostLayer.findMany({
      where: { productId: product, quantityRemaining: { gt: 0 } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { lot: { select: { lotNumber: true } } },
    });
    return layers.map((l) => ({
      lot: l.lot.lotNumber,
      quantity: l.quantityRemaining,
      value: l.valueRemaining.toFixed(2),
    }));
  }

  /**
   * Primera compra barata en un lote que vence tarde; segunda cara en uno que vence antes.
   * FEFO saca físicamente del lote caro (L-CARO), así se distinguen los tres métodos.
   */
  async function receiveCheapThenExpensive() {
    await receive([{ lot: 'L-BARATO', quantity: 10, unitCost: 1000, expires: '2099-01-01' }]);
    await receive([{ lot: 'L-CARO', quantity: 10, unitCost: 2000, expires: '2098-01-01' }]);
  }

  it('PEPS: la venta sale físicamente por FEFO pero cuesta la capa más antigua', async () => {
    await setPolicy('FIFO', yesterday());
    await receiveCheapThenExpensive();
    expect(await openLayers()).toEqual([
      { lot: 'L-BARATO', quantity: 10, value: '10000.00' },
      { lot: 'L-CARO', quantity: 10, value: '20000.00' },
    ]);

    const sale = await sold(12);
    expect(sale.lines[0].lotAllocations[0].lotNumber).toBe('L-CARO');
    // 10 de la capa de 1000 y 2 de la de 2000
    expect(await costOf(sale.id)).toBe('14000.00');
    expect(await posted('COST_OF_SALES', 'SALE', sale.id)).toBe('14000.00');
    expect(await balance()).toEqual({ quantity: 8, value: '16000.00' });
    expect(await openLayers()).toEqual([{ lot: 'L-CARO', quantity: 8, value: '16000.00' }]);
  });

  it('costo identificado: la venta cuesta lo que costó la existencia de la que salió', async () => {
    await setPolicy('SPECIFIC_LOT', yesterday());
    await receiveCheapThenExpensive();

    const sale = await sold(12);
    // FEFO: 10 de L-CARO (2000) y 2 de L-BARATO (1000)
    expect(await costOf(sale.id)).toBe('22000.00');
    expect(await balance()).toEqual({ quantity: 8, value: '8000.00' });
    expect(await openLayers()).toEqual([{ lot: 'L-BARATO', quantity: 8, value: '8000.00' }]);
  });

  it('costo identificado: anulación, nota crédito y ajustes vuelven a la misma existencia', async () => {
    await setPolicy('SPECIFIC_LOT', yesterday());
    await receiveCheapThenExpensive();
    const sale = await sold(3);
    expect(await costOf(sale.id)).toBe('6000.00');

    const cancel = await request(app.getHttpServer())
      .post(`/api/v1/sales/${sale.id}/cancel`)
      .set('Cookie', cookie)
      .send({ reason: 'Error de digitación en caja' });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);
    expect(await balance()).toEqual({ quantity: 20, value: '30000.00' });

    // Un ajuste positivo en L-BARATO entra al costo de esa existencia, no al promedio
    const cheapLot = await prisma.inventoryLot.findFirstOrThrow({
      where: { productId, lotNumber: 'L-BARATO' },
    });
    const adjust = await request(app.getHttpServer())
      .post('/api/v1/inventory/movements/adjust')
      .set('Cookie', cookie)
      .send({
        productId,
        lotId: cheapLot.id,
        adjustmentType: 'INCREMENTO',
        quantityBaseUnits: 2,
        reason: 'Conteo físico',
      });
    expect(adjust.status, JSON.stringify(adjust.body)).toBe(201);
    expect(await balance()).toEqual({ quantity: 22, value: '32000.00' });
    expect(await physical()).toBe(22);
  });

  it('cambio de método: convierte el saldo al costo promedio sin cambiar su valor y deja constancia', async () => {
    await setPolicy('WEIGHTED_AVERAGE', yesterday());
    await receiveCheapThenExpensive();
    expect(await balance()).toEqual({ quantity: 20, value: '30000.00' });
    expect(await openLayers()).toEqual([]);

    const fifo = await setPolicy('FIFO', businessToday());
    const sale = await sold(4);
    // Las capas se reconstruyeron al promedio vigente (1500): PEPS no revalúa el pasado
    expect(await costOf(sale.id)).toBe('6000.00');
    expect(await balance()).toEqual({ quantity: 16, value: '24000.00' });

    const conversions = await prisma.inventoryCostingConversion.findMany({ where: { productId } });
    expect(conversions).toHaveLength(1);
    expect(conversions[0]).toMatchObject({
      fromMethod: 'WEIGHTED_AVERAGE',
      toMethod: 'FIFO',
      quantityBaseUnits: 20,
      policyId: fifo.id,
    });
    expect(conversions[0].totalValue.toFixed(2)).toBe('30000.00');
    const stored = await prisma.inventoryCostBalance.findUniqueOrThrow({ where: { productId } });
    expect(stored.costingMethod).toBe('FIFO');

    // Lo que entra después ya forma su propia capa a su costo
    await receive([{ lot: 'L-NUEVO', quantity: 4, unitCost: 3000, expires: '2099-06-01' }]);
    const next = await sold(16);
    expect(await costOf(next.id)).toBe('24000.00');
    expect(await openLayers()).toEqual([{ lot: 'L-NUEVO', quantity: 4, value: '12000.00' }]);
  });

  it('la política solo cambia el método desde el primer día de un mes futuro', async () => {
    const setup = await request(app.getHttpServer())
      .post('/api/v1/company/setup')
      .set('Cookie', cookie)
      .send({
        legalName: 'Droguería API SAS',
        taxId: '900123456',
        taxIdCheckDigit: '8',
        sectorProfile: 'PHARMACY',
        municipalityCode: '05001',
        branch: { code: 'PRINCIPAL', name: 'Sede principal', municipalityCode: '05001' },
      });
    expect(setup.status, JSON.stringify(setup.body)).toBe(201);

    const today = businessToday();
    const [year, month] = today.split('-').map(Number);
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const policy = (costingMethod: string, effectiveFrom: string) =>
      request(app.getHttpServer())
        .post('/api/v1/company/accounting-policies')
        .set('Cookie', cookie)
        .send({
          effectiveFrom,
          costingMethod,
          openingCostSource: 'LAST_PURCHASE_THEN_CATALOG',
          purchaseReturnVariancePurpose: 'COST_OF_SALES',
          bonusUnitsTreatment: 'ZERO_COST_IN_AVERAGE',
          reason: 'Cambio a PEPS al cierre del mes',
        });

    const now = await policy('FIFO', today);
    expect(now.status).toBe(400);
    expect(now.body.message).toMatch(/primer día de un mes futuro/);
    expect((await policy('FIFO', nextMonth.replace(/-01$/, '-02'))).status).toBe(400);
    const ok = await policy('FIFO', nextMonth);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.costingMethod).toBe('FIFO');
  });
});
