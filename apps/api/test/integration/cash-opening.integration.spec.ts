import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma, seedRbac, Prisma } from '@farmacia/database';
import type { CreateOpeningBalancePayload } from '@farmacia/contracts';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';
import { businessToday } from '../../src/common/utils/business-date';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import { PrismaCashMovementRepository } from '../../src/modules/cash/infrastructure/prisma-cash-movement.repository';

/**
 * FARM-TEST-001: todos los saldos operativos se originan por API pública. La única
 * excepción es JournalService.post en legacyOpening(): reproduce un asiento publicado por
 * una versión anterior, sin sembrar movimientos ni saldos operativos mediante Prisma.
 * Los fixtures directos restantes son usuarios y catálogo, nunca dinero operativo.
 */
describe('FARM-TEST-001 — apertura operativa de caja', () => {
  let app: INestApplication;
  let journal: JournalService;
  let cookie: string;
  let cashierCookie: string;
  let adminId: string;
  let companyId: string;
  let cashId: string;
  let bankId: string;
  let capitalId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    journal = module.get(JournalService);
    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await module.get(UserProvisioningService).provisionInitialUser({
      username: 'cash_opening_admin',
      password: 'AdminPassword#2026',
    });
    adminId = admin.id!;
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: role.id } });
    const cashier = await prisma.user.create({
      data: {
        username: 'cash_opening_cashier',
        passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: adminId } }))
          .passwordHash,
      },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    const auth = module.get(AuthService);
    cookie = `${SESSION_COOKIE_NAME}=${(await auth.login('cash_opening_admin', 'AdminPassword#2026')).rawToken}`;
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('cash_opening_cashier', 'AdminPassword#2026')).rawToken}`;
  }, 45000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Aislamiento de casos sin invalidar usuarios/sesiones. CASCADE incluye CashOpening.
    await prisma.$executeRaw`TRUNCATE TABLE "company_accounting_policies", "branches", "companies", "treasury_documents", "document_locks", "debit_note_lines", "debit_notes", "credit_note_lines", "credit_notes", "fiscal_periods", "expense_payments", "expenses", "expense_categories", "bank_movements", "bank_accounts", "product_tax_profiles", "journal_entry_lines", "journal_entries", "company_accounting_mappings", "accounts", "inventory_alerts", "background_jobs", "payable_payments", "payables", "receivable_payments", "receivables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "cash_movements", "customers", "purchase_lines", "purchases", "suppliers", "inventory_valuation_movements", "inventory_cost_balances", "inventory_movements", "inventory_lots", "locations", "product_presentations", "products", "categories", "audit_events" CASCADE`;
    await prisma.$executeRaw`UPDATE "treasury_document_sequences" SET "last_value" = 0`;
    const company = await post('company/setup', {
      legalName: 'Droguería Vida Sana S.A.S.',
      taxId: '900123456',
      taxIdCheckDigit: '8',
      sectorProfile: 'PHARMACY',
      municipalityCode: '05001',
      branch: { code: 'PRINCIPAL', name: 'Sede principal', municipalityCode: '05001' },
    });
    expect(company.status, JSON.stringify(company.body)).toBe(201);
    companyId = company.body.id;
    await post('accounting/setup/apply-template', { template: 'PHARMACY' }).expect(200);
    cashId = (await prisma.account.findUniqueOrThrow({ where: { code: '110505' } })).id;
    bankId = (await prisma.account.findUniqueOrThrow({ where: { code: '111005' } })).id;
    capitalId = (await prisma.account.findUniqueOrThrow({ where: { code: '310505' } })).id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const api = () => request(app.getHttpServer());
  const post = (path: string, body: unknown, key = randomUUID(), session = cookie) =>
    api()
      .post(`/api/v1/${path}`)
      .set('Cookie', session)
      .set('Idempotency-Key', key)
      .send(body as object);
  const get = (path: string) => api().get(`/api/v1/${path}`).set('Cookie', cookie);

  function opening(cash = '2000000.00', bank = '6000000.00'): CreateOpeningBalancePayload {
    const cashValue = new Prisma.Decimal(cash);
    const bankValue = new Prisma.Decimal(bank);
    return {
      entryDate: businessToday(),
      reason: 'FARM-TEST-001: recursos iniciales respaldados',
      lines: [
        ...(cashValue.gt(0) ? [{ accountId: cashId, debit: cash, credit: '0' }] : []),
        ...(bankValue.gt(0) ? [{ accountId: bankId, debit: bank, credit: '0' }] : []),
        { accountId: capitalId, debit: '0', credit: cashValue.plus(bankValue).toFixed(2) },
      ],
    };
  }

  async function createOpening(body = opening(), key = randomUUID()) {
    const res = await post('accounting/opening-balances', body, key);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res;
  }

  async function legacyOpening(body = opening('2000000.00', '0')) {
    return journal.post({
      entryDate: body.entryDate,
      description: `Saldos de apertura: ${body.reason}`,
      sourceType: 'OPENING_BALANCE',
      sourceId: `LEGACY-${randomUUID()}`,
      createdById: adminId,
      lines: body.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
      })),
    });
  }

  const repairBody = () => ({
    companyId,
    accountId: cashId,
    expectedAmount: '2000000.00',
    reason: 'Incorporar efectivo ya contabilizado; revisión autorizada de prueba',
  });

  async function expectCashReconciled(amount: string) {
    const res = await get('accounting/reconciliation').expect(200);
    expect(res.body.items.find((i: { key: string }) => i.key === 'CASH')).toMatchObject({
      ledgerBalance: amount,
      subledgerBalance: amount,
      difference: '0.00',
      ok: true,
    });
  }

  async function receipt(amount = '1000.00') {
    return post('treasury/cash-receipts', {
      kind: 'MANUAL',
      paymentMethod: 'EFECTIVO',
      concept: 'Fondos adicionales posteriores a la apertura',
      amount,
      counterpartAccountId: capitalId,
    });
  }

  it('incorpora $2M una vez, mantiene bancos en $6M y publica únicamente el asiento de $8M', async () => {
    const bank = await post('treasury/bank-accounts', {
      ledgerAccountId: bankId,
      bankName: 'Banco de pruebas',
      accountType: 'AHORROS',
      accountNumber: '1234567890',
      name: 'Cuenta principal',
      initialBalance: '6000000.00',
    }).expect(201);
    const created = await createOpening();
    expect(created.body).toMatchObject({ totalDebit: '8000000.00', totalCredit: '8000000.00' });
    expect(await prisma.journalEntry.count()).toBe(1);
    expect(await prisma.cashMovement.count()).toBe(1);
    expect(await prisma.cashOpening.count()).toBe(1);
    expect(await prisma.treasuryDocument.count()).toBe(0);
    const cashReport = await get('reports/cash-summary').expect(200);
    expect(cashReport.body.data).toMatchObject({
      totalInflows: 0,
      totalOutflows: 0,
      netCashFlow: 0,
      totalMovements: 0,
    });
    expect(await prisma.bankMovement.count()).toBe(1);
    expect(
      (await get(`treasury/bank-accounts/${bank.body.id}`).expect(200)).body.currentBalance,
    ).toBe('6000000.00');
    const balance = await get('cash-movements/balance').expect(200);
    expect(balance.body).toMatchObject({
      currentBalance: 2000000,
      totalIncomeToday: 0,
      totalExpenseToday: 0,
      movementsCountToday: 0,
    });
    await expectCashReconciled('2000000.00');
    const rec = await get('accounting/reconciliation');
    expect(rec.body.items.find((i: { key: string }) => i.key === 'BANK')).toMatchObject({
      ledgerBalance: '6000000.00',
      subledgerBalance: '6000000.00',
      difference: '0.00',
      ok: true,
    });
    const movement = (await get('cash-movements').expect(200)).body.items[0];
    expect(movement).toMatchObject({
      movementType: 'SALDO_APERTURA',
      amount: 2000000,
      balanceAfter: 2000000,
      referenceDocumentType: 'OPENING_BALANCE',
      referenceDocumentId: created.body.journalEntryId,
    });
    const link = await prisma.cashOpening.findUniqueOrThrow({
      where: { journalEntryId: created.body.journalEntryId },
    });
    expect(link).toMatchObject({
      companyId,
      accountId: cashId,
      cashMovementId: movement.id,
      createdById: adminId,
    });
    expect(link.amount.toFixed(2)).toBe('2000000.00');
    expect(link.effectiveDate.toISOString().slice(0, 10)).toBe(businessToday());
    expect(link.createdAt).toBeInstanceOf(Date);
  });

  it('conserva la fecha efectiva histórica y registra la incorporación con su fecha real', async () => {
    // Fixture de configuración histórica; no modifica importes ni movimientos operativos.
    await prisma.companyAccountingMapping.updateMany({
      data: { effectiveFrom: new Date('2020-01-01T00:00:00.000Z') },
    });
    const body = opening('2000000.00', '0');
    body.entryDate = '2026-11-03';
    const before = Date.now();
    const created = await createOpening(body);
    const link = await prisma.cashOpening.findUniqueOrThrow({
      where: { journalEntryId: created.body.journalEntryId },
    });
    expect(link.effectiveDate.toISOString().slice(0, 10)).toBe('2026-11-03');
    expect(link.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    const movement = await prisma.cashMovement.findUniqueOrThrow({
      where: { id: link.cashMovementId },
    });
    expect(movement.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    const balance = await get('cash-movements/balance').expect(200);
    expect(balance.body).toMatchObject({
      currentBalance: 2000000,
      totalIncomeToday: 0,
      totalExpenseToday: 0,
    });
    await expectCashReconciled('2000000.00');
  });

  it('una apertura sin efectivo no genera movimiento, vínculo ni recibo', async () => {
    await createOpening(opening('0', '6000000.00'));
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.cashOpening.count()).toBe(0);
    expect(await prisma.treasuryDocument.count()).toBe(0);
    await expectCashReconciled('0.00');
  });

  it('resuelve CASH configurado en otra cuenta y conserva el importe neto de sus líneas', async () => {
    const account = await post('accounts', {
      code: '119999',
      name: 'Efectivo propio',
      type: 'ASSET',
      allowsMovement: true,
    }).expect(201);
    await api()
      .put('/api/v1/accounting/purposes/CASH')
      .set('Cookie', cookie)
      .send({ accountId: account.body.id })
      .expect(200);
    cashId = account.body.id;
    const body = opening('2000000.00', '0');
    body.lines[0].debit = '2500000.00';
    body.lines.push({ accountId: cashId, debit: '0', credit: '500000.00' });
    await createOpening(body);
    await expectCashReconciled('2000000.00');
    expect((await prisma.cashOpening.findFirstOrThrow()).accountId).toBe(cashId);
  });

  it('un neto CASH cero no incorpora efectivo', async () => {
    const body = opening('0', '6000000.00');
    body.lines.push(
      { accountId: cashId, debit: '100.00', credit: '0' },
      { accountId: cashId, debit: '0', credit: '100.00' },
    );
    await createOpening(body);
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it('rechaza efectivo inicial negativo y no publica ningún registro', async () => {
    const body = opening('0', '6000000.00');
    body.lines[1].credit = '6000100.00';
    body.lines.push({ accountId: cashId, debit: '0', credit: '100.00' });
    body.lines[0].debit = '6000200.00';
    await post('accounting/opening-balances', body).expect(400);
    expect(await prisma.journalEntry.count()).toBe(0);
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it('rechaza la apertura si no existe un mapeo CASH utilizable', async () => {
    await prisma.companyAccountingMapping.updateMany({
      where: { purpose: 'CASH' },
      data: { status: 'PENDING_MAPPING', accountId: null },
    });
    await post('accounting/opening-balances', opening()).expect(409);
    expect(await prisma.journalEntry.count()).toBe(0);
  });

  it('requiere Idempotency-Key y rechaza reutilizarla con datos diferentes', async () => {
    await api()
      .post('/api/v1/accounting/opening-balances')
      .set('Cookie', cookie)
      .send(opening())
      .expect(400);
    const key = randomUUID();
    const body = opening();
    const created = await createOpening(body, key);
    const retry = await post('accounting/opening-balances', body, key).expect(201);
    expect(retry.body).toEqual(created.body);
    await post(
      'accounting/opening-balances',
      { ...body, reason: 'Solicitud diferente' },
      key,
    ).expect(409);
    expect(await prisma.journalEntry.count()).toBe(1);
    expect(await prisma.cashMovement.count()).toBe(1);
  });

  it('la expiración de la clave HTTP no permite incorporar nuevamente el saldo', async () => {
    const key = randomUUID();
    const body = opening();
    await createOpening(body, key);
    await prisma.idempotencyKey.update({
      where: { key },
      data: { createdAt: new Date('2020-01-01'), expiresAt: new Date('2020-01-02') },
    });
    await post('accounting/opening-balances', body, key).expect(409);
    expect(await prisma.cashOpening.count()).toBe(1);
    expect(await prisma.cashMovement.count()).toBe(1);
  });

  it('solicitudes concurrentes con la misma clave devuelven una sola apertura', async () => {
    const key = randomUUID();
    const body = opening();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => post('accounting/opening-balances', body, key)),
    );
    for (const response of responses)
      expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(new Set(responses.map((r) => r.body.journalEntryId)).size).toBe(1);
    expect(await prisma.journalEntry.count()).toBe(1);
    expect(await prisma.cashMovement.count()).toBe(1);
    expect(await prisma.cashOpening.count()).toBe(1);
  });

  it('solicitudes simultáneas con claves distintas no crean dos aperturas', async () => {
    const body = opening();
    const responses = await Promise.all([
      post('accounting/opening-balances', body),
      post('accounting/opening-balances', body),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.journalEntry.count()).toBe(1);
    expect(await prisma.cashMovement.count()).toBe(1);
  });

  it.each(['journal', 'cash'] as const)(
    'un fallo en %s revierte asiento, auxiliar, vínculo e idempotencia',
    async (component) => {
      const failure = new Error(`Fallo simulado en ${component}`);
      if (component === 'journal')
        vi.spyOn(JournalService.prototype, 'post').mockRejectedValueOnce(failure);
      else
        vi.spyOn(PrismaCashMovementRepository.prototype, 'saveTransactional').mockRejectedValueOnce(
          failure,
        );
      const key = randomUUID();
      const body = opening();
      await post('accounting/opening-balances', body, key).expect(500);
      expect(await prisma.journalEntry.count()).toBe(0);
      expect(await prisma.cashMovement.count()).toBe(0);
      expect(await prisma.cashOpening.count()).toBe(0);
      expect(await prisma.idempotencyKey.count({ where: { key } })).toBe(0);
      vi.restoreAllMocks();
      await createOpening(body, key);
      await expectCashReconciled('2000000.00');
    },
  );

  it('un fallo después de insertar el movimiento revierte también el efectivo operativo', async () => {
    const save = PrismaCashMovementRepository.prototype.saveTransactional;
    vi.spyOn(PrismaCashMovementRepository.prototype, 'saveTransactional').mockImplementationOnce(
      async function (this: PrismaCashMovementRepository, data, tx) {
        await save.call(this, data, tx);
        throw new Error('Fallo después de insertar efectivo, antes de guardar el vínculo');
      },
    );
    const key = randomUUID();
    const body = opening();
    await post('accounting/opening-balances', body, key).expect(500);
    expect(await prisma.journalEntry.count()).toBe(0);
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.cashOpening.count()).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { key } })).toBe(0);
    vi.restoreAllMocks();
    await createOpening(body, key);
    await expectCashReconciled('2000000.00');
  });

  it('una venta posterior usa el saldo inicial y no cuenta la apertura como ingreso del día', async () => {
    await createOpening(opening('2000000.00', '0'));
    const category = await prisma.category.create({ data: { name: 'Prueba apertura' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'OPEN-1',
        name: 'Producto de prueba',
        inventoryControlMode: 'LOT_EXPIRY',
        basePrice: '1000.00',
        baseCost: '600.00',
      },
    });
    const location = await prisma.location.create({
      data: { code: 'OPEN', name: 'Estante', isDefault: true },
    });
    await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        controlMode: 'LOT_EXPIRY',
        lotNumber: 'OPEN-LOT',
        expirationDate: new Date('2099-01-01'),
        currentQuantity: 10,
      },
    });
    await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final',
        isDefault: true,
      },
    });
    await post('sales/confirm', {
      paymentMethod: 'EFECTIVO',
      items: [{ productId: product.id, quantityCommercial: 1 }],
    }).expect(201);
    const balance = await get('cash-movements/balance').expect(200);
    expect(balance.body).toMatchObject({
      currentBalance: 2001000,
      totalIncomeToday: 1000,
      totalExpenseToday: 0,
    });
    await expectCashReconciled('2001000.00');
    const movements = (await get('cash-movements?sortOrder=asc')).body.items;
    expect(movements.map((m: { balanceAfter: number }) => m.balanceAfter)).toEqual([
      2000000, 2001000,
    ]);
    expect(Date.parse(movements[1].createdAt)).toBeGreaterThan(Date.parse(movements[0].createdAt));
  });

  it('un egreso posterior descuenta solo su importe y mantiene la conciliación', async () => {
    await createOpening(opening('2000000.00', '0'));
    const expense = await post('accounts', {
      code: '519599',
      name: 'Gasto de prueba',
      type: 'EXPENSE',
      allowsMovement: true,
    }).expect(201);
    await post('treasury/disbursements', {
      kind: 'MANUAL',
      paymentMethod: 'EFECTIVO',
      concept: 'Egreso posterior a apertura',
      amount: '100000.00',
      counterpartAccountId: expense.body.id,
    }).expect(201);
    const balance = await get('cash-movements/balance').expect(200);
    expect(balance.body).toMatchObject({
      currentBalance: 1900000,
      totalIncomeToday: 0,
      totalExpenseToday: 100000,
    });
    await expectCashReconciled('1900000.00');
  });

  it('recibos concurrentes posteriores conservan orden estricto y cadena balanceAfter', async () => {
    await createOpening(opening('2000000.00', '0'));
    const responses = await Promise.all(Array.from({ length: 4 }, () => receipt('1000.00')));
    for (const response of responses)
      expect(response.status, JSON.stringify(response.body)).toBe(201);
    const movements = (await get('cash-movements?sortOrder=asc')).body.items;
    expect(movements.map((m: { balanceAfter: number }) => m.balanceAfter)).toEqual([
      2000000, 2001000, 2002000, 2003000, 2004000,
    ]);
    for (let i = 1; i < movements.length; i++)
      expect(Date.parse(movements[i].createdAt)).toBeGreaterThan(
        Date.parse(movements[i - 1].createdAt),
      );
    await expectCashReconciled('2004000.00');
  });

  it('no permite anular únicamente el asiento después de incorporar caja', async () => {
    const created = await createOpening();
    await post(`journal-entries/${created.body.journalEntryId}/annul`, {
      entryDate: businessToday(),
      reason: 'Intento de anular solo contabilidad',
    }).expect(409);
    expect(await prisma.journalEntry.count()).toBe(1);
    await expectCashReconciled('2000000.00');
  });

  it('repara una apertura previa con el asiento original y no crea otro asiento ni recibo', async () => {
    const original = await legacyOpening();
    expect((await get('cash-movements/balance')).body.currentBalance).toBe(0);
    const key = randomUUID();
    const body = repairBody();
    const repaired = await post(
      `accounting/opening-balances/${original.id}/cash`,
      body,
      key,
    ).expect(201);
    expect(repaired.body).toMatchObject({
      companyId,
      journalEntryId: original.id,
      accountId: cashId,
      amount: '2000000.00',
      effectiveDate: businessToday(),
      createdById: adminId,
    });
    expect(repaired.body.cashMovementId).toEqual(expect.any(String));
    expect(repaired.body.createdAt).toEqual(expect.any(String));
    const retry = await post(`accounting/opening-balances/${original.id}/cash`, body, key).expect(
      201,
    );
    expect(retry.body).toEqual(repaired.body);
    await post(`accounting/opening-balances/${original.id}/cash`, body).expect(409);
    expect(await prisma.journalEntry.count()).toBe(1);
    expect(await prisma.cashMovement.count()).toBe(1);
    expect(await prisma.cashOpening.count()).toBe(1);
    expect(await prisma.treasuryDocument.count()).toBe(0);
    await expectCashReconciled('2000000.00');
  });

  it('un fallo de incorporación legacy conserva el asiento original y permite un reintento seguro', async () => {
    const original = await legacyOpening();
    const before = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: original.id },
      include: { lines: true },
    });
    const key = randomUUID();
    const body = repairBody();
    vi.spyOn(PrismaCashMovementRepository.prototype, 'saveTransactional').mockRejectedValueOnce(
      new Error('Fallo simulado de reparación'),
    );
    await post(`accounting/opening-balances/${original.id}/cash`, body, key).expect(500);
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.cashOpening.count()).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { key } })).toBe(0);
    expect(
      await prisma.journalEntry.findUniqueOrThrow({
        where: { id: original.id },
        include: { lines: true },
      }),
    ).toEqual(before);
    vi.restoreAllMocks();
    await post(`accounting/opening-balances/${original.id}/cash`, body, key).expect(201);
    await expectCashReconciled('2000000.00');
  });

  it('reparaciones simultáneas con la misma clave devuelven el mismo vínculo', async () => {
    const original = await legacyOpening();
    const key = randomUUID();
    const body = repairBody();
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        post(`accounting/opening-balances/${original.id}/cash`, body, key),
      ),
    );
    for (const response of responses)
      expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma.cashMovement.count()).toBe(1);
    expect(await prisma.cashOpening.count()).toBe(1);
  });

  it('dos reparaciones simultáneas nunca incorporan el saldo dos veces', async () => {
    const original = await legacyOpening();
    const body = repairBody();
    const responses = await Promise.all([
      post(`accounting/opening-balances/${original.id}/cash`, body),
      post(`accounting/opening-balances/${original.id}/cash`, body),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.cashMovement.count()).toBe(1);
    expect(await prisma.cashOpening.count()).toBe(1);
    await expectCashReconciled('2000000.00');
  });

  it.each(['company', 'account', 'amount'] as const)(
    'rechaza reparación con %s distinto sin escribir',
    async (mismatch) => {
      const original = await legacyOpening();
      const body = repairBody();
      if (mismatch === 'company') body.companyId = randomUUID();
      if (mismatch === 'account') body.accountId = bankId;
      if (mismatch === 'amount') body.expectedAmount = '1999999.00';
      await post(`accounting/opening-balances/${original.id}/cash`, body).expect(409);
      expect(await prisma.cashMovement.count()).toBe(0);
      expect(await prisma.cashOpening.count()).toBe(0);
      expect(await prisma.journalEntry.count()).toBe(1);
    },
  );

  it('rechaza reparar una apertura que no contiene efectivo', async () => {
    const original = await legacyOpening(opening('0', '6000000.00'));
    await post(`accounting/opening-balances/${original.id}/cash`, repairBody()).expect(409);
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.cashOpening.count()).toBe(0);
  });

  it.each(['-1.00', 'abc', '1e6'])(
    'rechaza el importe esperado inválido %s',
    async (expectedAmount) => {
      const original = await legacyOpening();
      await post(`accounting/opening-balances/${original.id}/cash`, {
        ...repairBody(),
        expectedAmount,
      }).expect(400);
      expect(await prisma.cashMovement.count()).toBe(0);
    },
  );

  it.each(['companyId', 'accountId'] as const)(
    'rechaza %s como array en lugar de UUID',
    async (field) => {
      const original = await legacyOpening();
      const body = repairBody();
      await post(`accounting/opening-balances/${original.id}/cash`, {
        ...body,
        [field]: [body[field]],
      }).expect(400);
      expect(await prisma.cashMovement.count()).toBe(0);
    },
  );

  it('una reparación y anulación simultáneas no dejan el auxiliar vinculado a un asiento anulado', async () => {
    const original = await legacyOpening();
    const responses = await Promise.all([
      post(`accounting/opening-balances/${original.id}/cash`, repairBody()),
      post(`journal-entries/${original.id}/annul`, {
        entryDate: businessToday(),
        reason: 'Corrección concurrente de apertura legacy',
      }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const link = await prisma.cashOpening.findUnique({ where: { journalEntryId: original.id } });
    const reversal = await prisma.journalEntry.findUnique({ where: { reversalOfId: original.id } });
    expect(Boolean(link) && Boolean(reversal)).toBe(false);
    expect(Number(Boolean(link)) + Number(Boolean(reversal))).toBe(1);
    expect(await prisma.cashMovement.count()).toBe(link ? 1 : 0);
  });

  it('rechaza reparar una apertura anulada', async () => {
    const original = await legacyOpening();
    await post(`journal-entries/${original.id}/annul`, {
      entryDate: businessToday(),
      reason: 'Corrección legacy antes de incorporar caja',
    }).expect(201);
    await post(`accounting/opening-balances/${original.id}/cash`, repairBody()).expect(409);
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it('rechaza reparar un asiento que no es de apertura', async () => {
    const body = opening('2000000.00', '0');
    const note = await post('accounting/manual-notes', {
      entryDate: body.entryDate,
      description: 'Nota ordinaria sin origen apertura',
      lines: body.lines,
    }).expect(201);
    await post(`accounting/opening-balances/${note.body.journalEntryId}/cash`, repairBody()).expect(
      409,
    );
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it('rechaza reparar si otros asientos modificaron CASH aunque no exista historial operativo', async () => {
    const original = await legacyOpening();
    await post('accounting/manual-notes', {
      entryDate: businessToday(),
      description: 'Ajuste posterior de caja sin auxiliar',
      lines: [
        { accountId: cashId, debit: '100.00', credit: '0' },
        { accountId: capitalId, debit: '0', credit: '100.00' },
      ],
    }).expect(201);
    expect(await prisma.cashMovement.count()).toBe(0);
    await post(`accounting/opening-balances/${original.id}/cash`, repairBody()).expect(409);
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.cashOpening.count()).toBe(0);
    expect(await prisma.journalEntry.count()).toBe(2);
  });

  it('rechaza reparar si existe cualquier historial de caja, aun con saldo final cero', async () => {
    const original = await legacyOpening();
    await receipt('1000.00').then((r) => expect(r.status, JSON.stringify(r.body)).toBe(201));
    await post('treasury/disbursements', {
      kind: 'MANUAL',
      paymentMethod: 'EFECTIVO',
      concept: 'Devolución de aporte posterior',
      amount: '1000.00',
      counterpartAccountId: capitalId,
    }).expect(201);
    expect((await get('cash-movements/balance')).body.currentBalance).toBe(0);
    const before = await prisma.cashMovement.findMany({ orderBy: { createdAt: 'asc' } });
    await post(`accounting/opening-balances/${original.id}/cash`, repairBody()).expect(409);
    expect(await prisma.cashMovement.findMany({ orderBy: { createdAt: 'asc' } })).toEqual(before);
    expect(await prisma.cashOpening.count()).toBe(0);
  });

  it.each(['new', 'legacy'] as const)(
    'rechaza %s en una base con atribución empresarial ambigua',
    async (mode) => {
      const original = mode === 'legacy' ? await legacyOpening() : null;
      await prisma.company.create({
        data: {
          legalName: 'Otra empresa histórica',
          taxId: '900999999',
          taxIdCheckDigit: '1',
          sectorProfile: 'PHARMACY',
          municipalityCode: '05001',
          status: 'INACTIVE',
        },
      });
      if (original)
        await post(`accounting/opening-balances/${original.id}/cash`, repairBody()).expect(409);
      else await post('accounting/opening-balances', opening()).expect(409);
      expect(await prisma.cashMovement.count()).toBe(0);
      expect(await prisma.cashOpening.count()).toBe(0);
      expect(await prisma.journalEntry.count()).toBe(mode === 'legacy' ? 1 : 0);
    },
  );

  it('respeta permisos de apertura y reparación y no acepta acceso anónimo', async () => {
    await post('accounting/opening-balances', opening(), randomUUID(), cashierCookie).expect(403);
    const original = await legacyOpening();
    await post(
      `accounting/opening-balances/${original.id}/cash`,
      repairBody(),
      randomUUID(),
      cashierCookie,
    ).expect(403);
    await api()
      .post(`/api/v1/accounting/opening-balances/${original.id}/cash`)
      .set('Idempotency-Key', randomUUID())
      .send(repairBody())
      .expect(401);
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it('la base de datos rechaza un movimiento de apertura sin vínculo al confirmar', async () => {
    const original = await legacyOpening();
    // Prueba negativa de integridad: intenta saltarse deliberadamente el contrato público.
    await expect(
      prisma.cashMovement.create({
        data: {
          movementType: 'SALDO_APERTURA',
          amount: '2000000.00',
          paymentMethod: 'EFECTIVO',
          reason: 'Intento inválido sin trazabilidad',
          balanceAfter: '2000000.00',
          referenceDocumentType: 'OPENING_BALANCE',
          referenceDocumentId: original.id,
          createdByUserId: adminId,
        },
      }),
    ).rejects.toThrow();
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.cashOpening.count()).toBe(0);
    expect(await prisma.treasuryDocument.count()).toBe(0);
  });

  it('la base de datos impide modificar o borrar la trazabilidad de una apertura', async () => {
    const created = await createOpening();
    const link = await prisma.cashOpening.findUniqueOrThrow({
      where: { journalEntryId: created.body.journalEntryId },
    });
    await expect(
      prisma.cashOpening.update({ where: { id: link.id }, data: { amount: '1.00' } }),
    ).rejects.toThrow();
    await expect(prisma.cashOpening.delete({ where: { id: link.id } })).rejects.toThrow();
    await expect(
      prisma.cashOpening.create({ data: { ...link, id: randomUUID() } }),
    ).rejects.toThrow();
    const intact = await prisma.cashOpening.findUniqueOrThrow({ where: { id: link.id } });
    expect(intact.amount.toFixed(2)).toBe('2000000.00');
    await expectCashReconciled('2000000.00');
  });
});
