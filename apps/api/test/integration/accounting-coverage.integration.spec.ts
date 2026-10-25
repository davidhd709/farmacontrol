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
 * F8 (ADR-006): cobertura contable completa (ajustes, existencias iniciales, caja y bancos
 * manuales, notas con impuestos), libros oficiales, conciliación y borradores tributarios.
 */
describe('Cobertura contable completa y reportes', () => {
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
      username: 'coverage_admin',
      password: 'AdminPassword#2026',
    });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    cookie = `${SESSION_COOKIE_NAME}=${(await auth.login('coverage_admin', 'AdminPassword#2026')).rawToken}`;
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
      { purpose: 'INVENTORY_SHRINKAGE', code: '531595', type: 'EXPENSE' },
      { purpose: 'INVENTORY_SURPLUS', code: '425050', type: 'INCOME' },
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
      // Las líneas con cuenta explícita (contrapartida manual) no tienen propósito
      if (!line.purpose) continue;
      const net = new Prisma.Decimal(byPurpose[line.purpose] ?? 0)
        .plus(line.debit)
        .minus(line.credit);
      byPurpose[line.purpose] = net.toFixed(2);
    }
    return byPurpose;
  }

  it('contabiliza ajustes y existencias iniciales al costo del submayor', async () => {
    await receive([{ lot: 'L1', quantity: 10, unitCost: 1000 }]);
    const lot = await prisma.inventoryLot.findFirstOrThrow({ where: { productId } });
    const adjust = (adjustmentType: string, quantityBaseUnits: number) =>
      api().post('/api/v1/inventory/movements/adjust').set('Cookie', cookie).send({
        productId,
        lotId: lot.id,
        adjustmentType,
        quantityBaseUnits,
        reason: 'Conteo físico',
      });

    const out = await adjust('DECREMENTO', 2);
    expect(out.status, JSON.stringify(out.body)).toBe(201);
    expect(await journal('INVENTORY_ADJUSTMENT', out.body.data.id)).toEqual({
      INVENTORY_SHRINKAGE: '2000.00',
      INVENTORY: '-2000.00',
    });
    const inn = await adjust('INCREMENTO', 1);
    expect(inn.status).toBe(201);
    expect(await journal('INVENTORY_ADJUSTMENT', inn.body.data.id)).toEqual({
      INVENTORY: '1000.00',
      INVENTORY_SURPLUS: '-1000.00',
    });

    const other = await createProduct('INI-01', 700);
    const location = await prisma.location.findFirstOrThrow();
    const lotRes = await api().post('/api/v1/inventory/lots').set('Cookie', cookie).send({
      productId: other,
      locationId: location.id,
      lotNumber: 'INI',
      expirationDate: '2099-01-01',
      initialQuantity: 3,
    });
    expect(lotRes.status, JSON.stringify(lotRes.body)).toBe(201);
    expect(await journal('INVENTORY_INITIAL', lotRes.body.data.id)).toEqual({
      INVENTORY: '2100.00',
      INVENTORY_SURPLUS: '-2100.00',
    });

    // Con todo contabilizado, el inventario contable concilia con el submayor
    const rec = await api().get('/api/v1/accounting/reconciliation').set('Cookie', cookie);
    expect(rec.status).toBe(200);
    expect(rec.body.balanced).toBe(true);
    expect(rec.body.items.find((i: { key: string }) => i.key === 'INVENTORY')).toMatchObject({
      ledgerBalance: '11100.00',
      subledgerBalance: '11100.00',
      ok: true,
    });
  });

  it('exige contrapartida en caja y bancos manuales y reversa el asiento bancario', async () => {
    const expense = await prisma.account.create({
      data: {
        code: '519595',
        name: 'Gastos diversos',
        type: 'EXPENSE',
        level: 1,
        allowsMovement: true,
      },
    });
    const noCounterpart = await api()
      .post('/api/v1/cash-movements')
      .set('Cookie', cookie)
      .send({ movementType: 'INGRESO_MANUAL', amount: 50000, reason: 'Base de caja' });
    expect(noCounterpart.status).toBe(400);

    const capital = (
      await prisma.account.create({
        data: { code: '310505', name: 'Capital', type: 'EQUITY', level: 1, allowsMovement: true },
      })
    ).id;
    const cashIn = await api().post('/api/v1/cash-movements').set('Cookie', cookie).send({
      movementType: 'INGRESO_MANUAL',
      amount: 50000,
      reason: 'Base de caja',
      counterpartAccountId: capital,
    });
    expect(cashIn.status, JSON.stringify(cashIn.body)).toBe(201);
    expect(await journal('CASH_MOVEMENT', cashIn.body.id)).toEqual({ CASH: '50000.00' });
    const capitalLine = await prisma.journalEntryLine.findFirstOrThrow({
      where: {
        accountId: capital,
        journalEntry: { sourceType: 'CASH_MOVEMENT', sourceId: cashIn.body.id },
      },
    });
    expect(capitalLine.credit.toFixed(2)).toBe('50000.00');

    const bank = await prisma.bankAccount.create({
      data: {
        name: 'Cuenta corriente',
        bankName: 'Banco',
        accountNumber: '123',
        accountType: 'CORRIENTE',
        createdById: adminId,
      },
    });
    const bankOut = await api()
      .post(`/api/v1/treasury/bank-accounts/${bank.id}/movements`)
      .set('Cookie', cookie)
      .send({
        movementType: 'DEPOSIT',
        amount: '80000.00',
        concept: 'Aporte',
        counterpartAccountId: capital,
      });
    expect(bankOut.status, JSON.stringify(bankOut.body)).toBe(201);
    const fee = await api()
      .post(`/api/v1/treasury/bank-accounts/${bank.id}/movements`)
      .set('Cookie', cookie)
      .send({
        movementType: 'FEE',
        amount: '3000.00',
        concept: 'Comisión',
        counterpartAccountId: expense.id,
      });
    expect(fee.status).toBe(201);
    expect(await journal('BANK_MOVEMENT', fee.body.id)).toMatchObject({ BANK: '-3000.00' });

    const reverse = await api()
      .post(`/api/v1/treasury/bank-accounts/${bank.id}/movements/${fee.body.id}/reverse`)
      .set('Cookie', cookie)
      .send({ reason: 'Comisión cobrada por error' });
    expect(reverse.status, JSON.stringify(reverse.body)).toBe(200);
    const original = await prisma.journalEntry.findFirstOrThrow({
      where: { sourceType: 'BANK_MOVEMENT', sourceId: fee.body.id },
      include: { reversal: true },
    });
    expect(original.reversal).not.toBeNull();

    const rec = await api().get('/api/v1/accounting/reconciliation').set('Cookie', cookie);
    expect(rec.body.items.find((i: { key: string }) => i.key === 'BANK')).toMatchObject({
      ok: true,
      ledgerBalance: '80000.00',
    });
    expect(rec.body.items.find((i: { key: string }) => i.key === 'CASH')).toMatchObject({
      ok: true,
    });
  });

  it('nota crédito devuelve el INC y nota débito revierte IVA y retenciones en proporción', async () => {
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
      data: { taxResponsibilities: ['48'] },
    });
    await classify(productId, 'PURCHASE', 'IVA_19');
    await classify(productId, 'SALE', 'IVA_EXCLUIDO');
    await classify(productId, 'SALE', 'INC_8');

    const purchase = await receive([{ lot: 'L1', quantity: 100, unitCost: 20000 }]);
    const sale = await sold(2);
    // 2 × 5000 con INC 8 %
    expect(sale).toMatchObject({ subtotal: 10000, incTotal: 800, total: 10800 });

    const cn = await api()
      .post(`/api/v1/sales/${sale.id}/credit-notes`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Devolución de prueba',
        restock: true,
        items: [{ saleLineId: sale.lines[0].id, quantityCommercial: 1 }],
      });
    expect(cn.status, JSON.stringify(cn.body)).toBe(201);
    const note = await prisma.creditNote.findFirstOrThrow({ where: { saleId: sale.id } });
    expect({ total: note.total.toFixed(2), inc: note.incTotal.toFixed(2) }).toEqual({
      total: '5400.00',
      inc: '400.00',
    });
    expect(await journal('CREDIT_NOTE', note.id)).toMatchObject({
      INC_PAYABLE: '400.00',
      SALES_RETURNS: '5000.00',
    });

    // Devolver 25 de 100 unidades: un cuarto del IVA y de cada retención
    const dn = await api()
      .post(`/api/v1/purchases/${purchase.id}/debit-notes`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        reason: 'Devolución al proveedor',
        items: [{ purchaseLineId: purchase.lines[0].id, quantityCommercial: 25 }],
      });
    expect(dn.status, JSON.stringify(dn.body)).toBe(201);
    const debit = await prisma.debitNote.findFirstOrThrow({ where: { purchaseId: purchase.id } });
    expect({
      subtotal: debit.subtotal.toFixed(2),
      vat: debit.taxTotal.toFixed(2),
      total: debit.total.toFixed(2),
      rtf: debit.withholdingIncome.toFixed(2),
      reteiva: debit.withholdingVat.toFixed(2),
      reteica: debit.withholdingIca.toFixed(2),
    }).toEqual({
      subtotal: '500000.00',
      vat: '95000.00',
      total: '595000.00',
      rtf: '12500.00',
      reteiva: '14250.00',
      reteica: '4830.00',
    });
    const payable = await prisma.payable.findUniqueOrThrow({ where: { purchaseId: purchase.id } });
    // Neto original 2.253.680 menos el neto devuelto 563.420
    expect(payable.balance.toFixed(2)).toBe('1690260.00');
    expect(await journal('DEBIT_NOTE', debit.id)).toEqual({
      SUPPLIERS: '563420.00',
      WITHHOLDING_INCOME_PAYABLE: '12500.00',
      WITHHOLDING_VAT_PAYABLE: '14250.00',
      WITHHOLDING_ICA_PAYABLE: '4830.00',
      INVENTORY: '-500000.00',
      VAT_INPUT: '-95000.00',
    });

    // Borradores tributarios del período
    const today = businessToday();
    const vat = await api()
      .get(`/api/v1/tax-reports/vat?from=${today}&to=${today}`)
      .set('Cookie', cookie);
    expect(vat.status).toBe(200);
    expect(vat.body).toMatchObject({
      draft: true,
      vatGenerated: '0.00',
      vatDeductible: '285000.00',
      balance: '-285000.00',
      inc: { base: '10000.00', amount: '800.00', returns: '400.00' },
      purchaseReturns: { base: '500000.00', vat: '95000.00' },
    });
    const wh = await api()
      .get(`/api/v1/tax-reports/withholdings?from=${today}&to=${today}`)
      .set('Cookie', cookie);
    expect(wh.body.totals).toEqual({
      income: '37500.00',
      vat: '42750.00',
      ica: '14490.00',
      total: '94740.00',
    });
    const ica = await api()
      .get(`/api/v1/tax-reports/ica?from=${today}&to=${today}`)
      .set('Cookie', cookie);
    expect(ica.body).toMatchObject({
      netIncome: '5000.00',
      ratePerMil: '9.660',
      tax: '48.30',
      withheldIca: '14490.00',
    });
    const exo = await api()
      .get(`/api/v1/tax-reports/exogenous?year=${today.slice(0, 4)}`)
      .set('Cookie', cookie);
    expect(exo.body.payments).toEqual([
      expect.objectContaining({
        amount: '1500000.00',
        vat: '285000.00',
        withholdingIncome: '37500.00',
        withholdingVat: '42750.00',
      }),
    ]);
    expect(exo.body.income[0]).toMatchObject({ amount: '10000.00', returns: '5000.00' });
  });

  it('libro diario y libro mayor y balances cuadran', async () => {
    await receive([{ lot: 'L1', quantity: 10, unitCost: 1000 }]);
    await sold(3);
    const today = businessToday();
    const journalBook = await api()
      .get(`/api/v1/accounting/books/journal?from=${today}&to=${today}`)
      .set('Cookie', cookie);
    expect(journalBook.status).toBe(200);
    expect(journalBook.body.entries.length).toBeGreaterThanOrEqual(2);
    expect(journalBook.body.totalDebit).toBe(journalBook.body.totalCredit);
    const ledger = await api()
      .get(`/api/v1/accounting/books/ledger?from=${today}&to=${today}`)
      .set('Cookie', cookie);
    expect(ledger.body.totalDebit).toBe(ledger.body.totalCredit);
    const inventory = ledger.body.accounts.find((a: { code: string }) => a.code === '143501');
    expect(inventory).toMatchObject({
      openingBalance: '0.00',
      debit: '10000.00',
      credit: '3000.00',
      closingBalance: '7000.00',
    });
    expect(
      (
        await api()
          .get('/api/v1/accounting/books/ledger?from=2026-12-01&to=2026-01-01')
          .set('Cookie', cookie)
      ).status,
    ).toBe(400);
  });
});
