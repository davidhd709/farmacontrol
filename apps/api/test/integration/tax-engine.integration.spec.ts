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
 * F6 (ADR-006): catálogo normativo, perfil tributario de la empresa, clasificación de
 * productos y proveedores, y el motor tributario en ventas y compras, con PostgreSQL real.
 */
describe('Catálogo normativo y motor tributario', () => {
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
      username: 'tax_admin',
      password: 'AdminPassword#2026',
    });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    cookie = `${SESSION_COOKIE_NAME}=${(await auth.login('tax_admin', 'AdminPassword#2026')).rawToken}`;
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
      { purpose: 'SALES_EXEMPT', code: '413503', type: 'INCOME' },
      { purpose: 'INC_PAYABLE', code: '246405', type: 'LIABILITY' },
      { purpose: 'WITHHOLDING_INCOME_PAYABLE', code: '236540', type: 'LIABILITY' },
      { purpose: 'WITHHOLDING_VAT_PAYABLE', code: '236705', type: 'LIABILITY' },
      { purpose: 'WITHHOLDING_ICA_PAYABLE', code: '236805', type: 'LIABILITY' },
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

  const api = () => request(app.getHttpServer());

  async function setupCompany() {
    const res = await api()
      .post('/api/v1/company/setup')
      .set('Cookie', cookie)
      .send({
        legalName: 'Droguería Tributaria SAS',
        taxId: '900123456',
        taxIdCheckDigit: '8',
        sectorProfile: 'PHARMACY',
        municipalityCode: '05001',
        branch: { code: 'PRINCIPAL', name: 'Sede principal', municipalityCode: '05001' },
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  }

  function taxProfile(overrides: Record<string, unknown> = {}) {
    return api()
      .post('/api/v1/company/tax-profiles')
      .set('Cookie', cookie)
      .send({
        effectiveFrom: businessToday(),
        responsibilities: ['48'],
        reason: 'Responsabilidades según el RUT',
        ...overrides,
      });
  }

  /** Clasifica un producto con una regla del catálogo y activa la clasificación desde hoy. */
  async function classify(product: string, operation: 'SALE' | 'PURCHASE', taxRuleCode: string) {
    const created = await api().post('/api/v1/accounting/tax-profiles').set('Cookie', cookie).send({
      productId: product,
      operation,
      taxRuleCode,
      effectiveFrom: businessToday(),
      documentReference: 'Concepto del asesor tributario',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const active = await api()
      .post(`/api/v1/accounting/tax-profiles/${created.body.id}/activate`)
      .set('Cookie', cookie)
      .send({});
    expect(active.status, JSON.stringify(active.body)).toBe(201);
  }

  async function journal(sourceType: string, sourceId: string) {
    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntry: { status: 'POSTED', sourceType, sourceId } },
    });
    const byPurpose: Record<string, string> = {};
    for (const line of lines) {
      const net = new Prisma.Decimal(byPurpose[line.purpose] ?? 0)
        .plus(line.debit)
        .minus(line.credit);
      byPurpose[line.purpose] = net.toFixed(2);
    }
    return byPurpose;
  }

  it('expone el catálogo vigente y advierte que está pendiente de revisión del asesor', async () => {
    const res = await api().get('/api/v1/tax-catalog').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.pendingAdvisorReview).toBe(true);
    const codes = res.body.rules.map((r: { code: string }) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining(['IVA_19', 'IVA_5', 'IVA_EXCLUIDO', 'INC_8', 'RETEIVA_15']),
    );
    expect(res.body.uvt.find((u: { year: number }) => u.year === 2026)?.value).toBe('52374.00');
    // El contenido no se edita desde la aplicación
    await expect(
      prisma.$executeRaw`UPDATE tax_rules SET rate_pct = 20 WHERE code = 'IVA_19'`,
    ).rejects.toThrow();
  });

  it('valida el perfil tributario: IVA explícito e ICA dentro del rango del catálogo', async () => {
    await setupCompany();
    expect((await taxProfile({ responsibilities: ['48', '49'] })).status).toBe(400);
    expect((await taxProfile({ responsibilities: ['13'] })).status).toBe(400);
    expect((await taxProfile({ responsibilities: ['48', 'X'] })).status).toBe(400);
    const outOfRange = await taxProfile({ icaActivity: 'COMERCIAL', icaRatePerMil: '12' });
    expect(outOfRange.status).toBe(400);
    expect(outOfRange.body.message).toMatch(/entre 2.00 y 10.00 por mil/);
    const ok = await taxProfile({
      responsibilities: ['48', '13'],
      icaActivity: 'COMERCIAL',
      icaRatePerMil: '9.66',
      icaWithholdingAgent: true,
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.derived).toEqual({
      vatResponsible: true,
      withholdsIncome: true,
      withholdsVat: true,
      withholdsIca: true,
    });
    const list = await api().get('/api/v1/company/tax-profiles').set('Cookie', cookie);
    expect(list.body.current.id).toBe(ok.body.id);
  });

  it('sin perfil tributario la venta sigue sin impuestos, como antes del motor', async () => {
    await receive([{ lot: 'L1', quantity: 10, unitCost: 500 }]);
    const sale = await sold(2);
    expect(sale).toMatchObject({ taxTotal: 0, incTotal: 0, total: 10000 });
  });

  it('venta: sin 0 % implícito, IVA gravado, excluido e INC separados en el asiento', async () => {
    await setupCompany();
    expect((await taxProfile()).status).toBe(201);
    await receive([{ lot: 'L1', quantity: 10, unitCost: 500 }]);

    const blocked = await sell(1);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/no tiene clasificación de IVA activa/);

    await classify(productId, 'SALE', 'IVA_19');
    const excludedId = await createProduct('EXC-01', 300);
    await receive([{ lot: 'LX', quantity: 10, unitCost: 300 }], excludedId);
    await classify(excludedId, 'SALE', 'IVA_EXCLUIDO');
    const incId = await createProduct('INC-01', 300);
    await receive([{ lot: 'LI', quantity: 10, unitCost: 300 }], incId);
    await classify(incId, 'SALE', 'IVA_EXCLUIDO');
    await classify(incId, 'SALE', 'INC_8');

    const res = await api()
      .post('/api/v1/sales/confirm')
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        paymentMethod: 'EFECTIVO',
        items: [
          { productId, quantityCommercial: 2 },
          { productId: excludedId, quantityCommercial: 1 },
          { productId: incId, quantityCommercial: 1 },
        ],
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    // 2 × 5000 con IVA 19 %, 5000 excluido y 5000 con INC 8 %
    expect(res.body).toMatchObject({
      subtotal: 20000,
      taxTotal: 1900,
      incTotal: 400,
      total: 22300,
    });
    const line = await prisma.saleLine.findFirstOrThrow({
      where: { saleId: res.body.id, productId },
    });
    expect(line.taxSnapshot).toMatchObject({
      engine: 'F6',
      items: [{ taxType: 'IVA', ruleCode: 'IVA_19', base: '10000.00', amount: '1900.00' }],
    });
    expect(await journal('SALE', res.body.id)).toMatchObject({
      CASH: '22300.00',
      VAT_OUTPUT: '-1900.00',
      INC_PAYABLE: '-400.00',
      SALES_TAXED: '-10000.00',
      SALES_EXCLUDED: '-10000.00',
    });

    // El POS recibe las mismas tarifas para calcular igual que el backend
    const product = await api().get(`/api/v1/products/${incId}`).set('Cookie', cookie);
    expect(product.body.saleTax).toEqual({
      ivaRatePct: '0.00',
      incRatePct: '8.00',
      missingClassification: false,
    });
  });

  it('compra: IVA descontable y retenciones sobre la base mínima, con la cuenta por pagar por el neto', async () => {
    await setupCompany();
    expect(
      (
        await taxProfile({
          responsibilities: ['48', '13'],
          icaActivity: 'COMERCIAL',
          icaRatePerMil: '9.66',
          icaWithholdingAgent: true,
        })
      ).status,
    ).toBe(201);
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { taxResponsibilities: ['48'], isIncomeTaxDeclarant: true },
    });
    await classify(productId, 'PURCHASE', 'IVA_19');

    // 2.000.000 supera 27 UVT (1.414.098): retención 2,5 %, ReteIVA 15 % del IVA y ReteICA 9,66 ‰
    const purchase = await receive([{ lot: 'L1', quantity: 100, unitCost: 20000 }]);
    const stored = await prisma.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
      include: { payable: true, lines: true },
    });
    expect({
      subtotal: stored.subtotal?.toFixed(2),
      vat: stored.vatTotal.toFixed(2),
      total: stored.totalAmount.toFixed(2),
      rtf: stored.withholdingIncome.toFixed(2),
      reteiva: stored.withholdingVat.toFixed(2),
      reteica: stored.withholdingIca.toFixed(2),
      payable: stored.payable?.totalAmount.toFixed(2),
    }).toEqual({
      subtotal: '2000000.00',
      vat: '380000.00',
      total: '2380000.00',
      rtf: '50000.00',
      reteiva: '57000.00',
      reteica: '19320.00',
      payable: '2253680.00',
    });
    expect(stored.lines[0].vatAmount.toFixed(2)).toBe('380000.00');
    expect(await journal('PURCHASE', purchase.id)).toEqual({
      INVENTORY: '2000000.00',
      VAT_INPUT: '380000.00',
      SUPPLIERS: '-2253680.00',
      WITHHOLDING_INCOME_PAYABLE: '-50000.00',
      WITHHOLDING_VAT_PAYABLE: '-57000.00',
      WITHHOLDING_ICA_PAYABLE: '-19320.00',
    });
    // El inventario se valoriza sin el IVA descontable
    expect(await balance()).toEqual({ quantity: 100, value: '2000000.00' });

    // F8: la nota débito sobre una compra con impuestos ya se confirma (cubierta en accounting-coverage)
    const note = await api()
      .post(`/api/v1/purchases/${purchase.id}/debit-notes`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Devolución de prueba',
        items: [{ purchaseLineId: purchase.lines[0].id, quantityCommercial: 1 }],
      });
    expect(note.status, JSON.stringify(note.body)).toBe(201);
  });

  it('compra: una empresa no responsable de IVA lo lleva como mayor costo del inventario', async () => {
    await setupCompany();
    expect((await taxProfile({ responsibilities: ['49', '47'] })).status).toBe(201);
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { taxResponsibilities: ['48'] },
    });
    await classify(productId, 'PURCHASE', 'IVA_19');

    const purchase = await receive([{ lot: 'L1', quantity: 10, unitCost: 1000 }]);
    const stored = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(stored.vatTotal.toFixed(2)).toBe('1900.00');
    // Régimen simple: no practica retención en la fuente
    expect(stored.withholdingIncome.toFixed(2)).toBe('0.00');
    expect(await balance()).toEqual({ quantity: 10, value: '11900.00' });
    expect(await journal('PURCHASE', purchase.id)).toEqual({
      INVENTORY: '11900.00',
      SUPPLIERS: '-11900.00',
    });
  });

  it('un proveedor responsable exige la clasificación de compra del producto', async () => {
    await setupCompany();
    expect((await taxProfile()).status).toBe(201);
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { taxResponsibilities: ['48'] },
    });
    const res = await api()
      .post('/api/v1/purchases/receive')
      .set('Cookie', cookie)
      .send({
        supplierId,
        invoiceNumber: 'FAC-SIN-CLASIF',
        purchaseDate: businessToday(),
        lines: [
          {
            productId,
            lotNumber: 'L9',
            expirationDate: '2099-01-01',
            quantityCommercial: 1,
            unitCost: 100,
            locationId,
          },
        ],
      });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/clasificación de IVA activa para compra/);
  });
});
