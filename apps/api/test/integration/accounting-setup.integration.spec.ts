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
 * F7 (ADR-006): asistente de configuración contable con PostgreSQL real: plantilla PUC del
 * perfil, saldos de apertura y la lista de verificación del estado READY.
 */
describe('Asistente de configuración contable', () => {
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
      username: 'setup_admin',
      password: 'AdminPassword#2026',
    });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    cookie = `${SESSION_COOKIE_NAME}=${(await auth.login('setup_admin', 'AdminPassword#2026')).rawToken}`;
  }, 45000);

  beforeEach(async () => {
    // Conserva usuarios y permisos; limpia la operación de la prueba anterior
    await prisma.$executeRaw`TRUNCATE TABLE "company_accounting_policies", "branches", "companies", "inventory_valuation_movements", "inventory_cost_balances", "debit_note_lines", "debit_notes", "credit_note_lines", "credit_notes", "journal_entry_lines", "journal_entries", "company_accounting_mappings", "accounts", "payable_payments", "payables", "receivable_payments", "receivables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "cash_movements", "customers", "purchase_lines", "purchases", "suppliers", "inventory_movements", "inventory_lots", "locations", "product_presentations", "products", "categories", "treasury_documents", "audit_events" CASCADE`;
    await prisma.$executeRaw`UPDATE "treasury_document_sequences" SET "last_value" = 0`;

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
  const setup = () => api().get('/api/v1/accounting/setup').set('Cookie', cookie);
  const apply = () =>
    api()
      .post('/api/v1/accounting/setup/apply-template')
      .set('Cookie', cookie)
      .send({ template: 'PHARMACY' });
  const check = (body: { checks: Array<{ key: string; ok: boolean }> }, key: string) =>
    body.checks.find((c) => c.key === key)!;

  async function setupCompany() {
    const res = await api()
      .post('/api/v1/company/setup')
      .set('Cookie', cookie)
      .send({
        legalName: 'Droguería Lista SAS',
        taxId: '900123456',
        taxIdCheckDigit: '8',
        sectorProfile: 'PHARMACY',
        municipalityCode: '05001',
        branch: { code: 'PRINCIPAL', name: 'Sede principal', municipalityCode: '05001' },
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  }

  it('lleva a READY con la plantilla PUC: crea cuentas y mapea propósitos sin sobrescribir', async () => {
    const before = await setup();
    expect(before.status).toBe(200);
    expect(before.body.status).toBe('INCOMPLETE');
    expect(check(before.body, 'COMPANY').ok).toBe(false);

    // Un mapeo previo de caja a otra cuenta se conserva
    const own = await api()
      .post('/api/v1/accounts')
      .set('Cookie', cookie)
      .send({ code: '9905', name: 'Caja propia', type: 'ASSET', allowsMovement: true });
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    expect(
      (
        await api()
          .put('/api/v1/accounting/purposes/CASH')
          .set('Cookie', cookie)
          .send({ accountId: own.body.id })
      ).status,
    ).toBe(200);

    await setupCompany();
    const first = await apply();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.accountsCreated).toContain('413501');
    expect(first.body.purposesKept).toEqual(['CASH']);
    expect(first.body.purposesMapped).toContain('INVENTORY');
    expect(first.body.conflicts).toEqual([]);

    const cash = await prisma.companyAccountingMapping.findFirstOrThrow({
      where: { purpose: 'CASH', status: 'ACTIVE' },
      include: { account: true },
    });
    expect(cash.account?.code).toBe('9905');
    const devoluciones = await prisma.account.findUniqueOrThrow({ where: { code: '417505' } });
    expect(devoluciones.nature).toBe('DEBIT');

    // Aplicarla otra vez no cambia nada
    const again = await apply();
    expect(again.body.accountsCreated).toEqual([]);
    expect(again.body.purposesMapped).toEqual([]);

    const ready = await setup();
    expect(ready.body.status).toBe('READY');
    expect(check(ready.body, 'TAX_PURPOSES')).toMatchObject({ ok: true, required: false });
  });

  it('con perfil tributario exige los propósitos tributarios', async () => {
    await setupCompany();
    // Solo los propósitos operativos y de patrimonio, sin los tributarios
    await apply();
    await prisma.companyAccountingMapping.updateMany({
      where: { purpose: 'WITHHOLDING_ICA_PAYABLE' },
      data: { status: 'PENDING_MAPPING', accountId: null },
    });
    expect((await setup()).body.status).toBe('READY');
    const profile = await api()
      .post('/api/v1/company/tax-profiles')
      .set('Cookie', cookie)
      .send({ effectiveFrom: businessToday(), responsibilities: ['48'], reason: 'RUT' });
    expect(profile.status).toBe(201);
    const status = await setup();
    expect(status.body.status).toBe('INCOMPLETE');
    expect(check(status.body, 'TAX_PURPOSES')).toMatchObject({
      ok: false,
      required: true,
      missingPurposes: ['WITHHOLDING_ICA_PAYABLE'],
    });
  });

  it('informa conflictos sin tocar una cuenta existente con otro tipo', async () => {
    await setupCompany();
    const clash = await api()
      .post('/api/v1/accounts')
      .set('Cookie', cookie)
      .send({ code: '6', name: 'Cuentas propias', type: 'EXPENSE', allowsMovement: false });
    expect(clash.status).toBe(201);
    const res = await apply();
    expect(res.status).toBe(200);
    expect(res.body.conflicts.map((c: { code: string }) => c.code)).toEqual(
      expect.arrayContaining(['6', '61', '6135', '613501']),
    );
    expect(res.body.purposesMapped).not.toContain('COST_OF_SALES');
    expect((await setup()).body.status).toBe('INCOMPLETE');
  });

  it('registra los saldos de apertura una sola vez y concilia el inventario', async () => {
    await setupCompany();
    await apply();
    const id = async (code: string) =>
      (await prisma.account.findUniqueOrThrow({ where: { code } })).id;
    const lines = [
      { accountId: await id('110505'), debit: '500000.00', credit: '0' },
      { accountId: await id('143501'), debit: '1500000.00', credit: '0' },
      { accountId: await id('310505'), debit: '0', credit: '2000000.00' },
    ];
    const unbalanced = await api()
      .post('/api/v1/accounting/opening-balances')
      .set('Cookie', cookie)
      .send({ entryDate: businessToday(), reason: 'Inventario físico', lines: lines.slice(0, 2) });
    expect(unbalanced.status).toBe(400);

    const created = await api()
      .post('/api/v1/accounting/opening-balances')
      .set('Cookie', cookie)
      .send({ entryDate: businessToday(), reason: 'Inventario físico y caja al corte', lines });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ totalDebit: '2000000.00', totalCredit: '2000000.00' });

    const second = await api()
      .post('/api/v1/accounting/opening-balances')
      .set('Cookie', cookie)
      .send({ entryDate: businessToday(), reason: 'Otra vez', lines });
    expect(second.status).toBe(409);

    const status = await setup();
    expect(check(status.body, 'OPENING_BALANCES').ok).toBe(true);
    // El submayor aún no tiene existencias: la diferencia se informa sin bloquear READY
    expect(status.body.inventory).toEqual({
      ledgerBalance: '1500000.00',
      valuationBalance: '0.00',
      difference: '1500000.00',
    });
    expect(check(status.body, 'INVENTORY_RECONCILIATION')).toMatchObject({
      ok: false,
      required: false,
    });
    expect(status.body.status).toBe('READY');

    // Reversado el asiento, se pueden registrar otros saldos
    const reversed = await api()
      .post(`/api/v1/journal-entries/${created.body.journalEntryId}/reverse`)
      .set('Cookie', cookie)
      .send({ reason: 'Corrección de saldos de apertura', entryDate: businessToday() });
    expect([200, 201]).toContain(reversed.status);
    const again = await api()
      .post('/api/v1/accounting/opening-balances')
      .set('Cookie', cookie)
      .send({ entryDate: businessToday(), reason: 'Saldos corregidos', lines });
    expect(again.status, JSON.stringify(again.body)).toBe(201);
  });
});
