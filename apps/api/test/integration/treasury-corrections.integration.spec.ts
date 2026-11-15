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
import { seedPurposeMappings } from './support/accounting-fixtures';
import { businessToday } from '../../src/common/utils/business-date';

/**
 * Rediseño, fase 4 (D1): la corrección de un recibo o egreso anula el original y emite el
 * reemplazo en una sola transacción. Se prueba por la ruta HTTP que usa la web: saldos de
 * cartera, cuentas por pagar, caja y bancos, asientos reversados y nuevos, vínculo entre los dos
 * documentos, idempotencia, atomicidad ante un rechazo y respeto del bloqueo de documentos.
 */
describe('Corrección atómica de recibos de caja y comprobantes de egreso', () => {
  let app: INestApplication;
  let adminCookie: string;
  let cashierCookie: string;
  const roleCookies: Record<string, string> = {};
  let adminId: string;
  let customerId: string;
  let supplierId: string;
  let productId: string;
  let bankId: string;
  let capitalAccountId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    const provisioning = module.get(UserProvisioningService);
    const auth = module.get(AuthService);

    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await provisioning.provisionInitialUser({
      username: 'correccion_admin',
      password: 'AdminPassword#2026',
    });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('correccion_admin', 'AdminPassword#2026')).rawToken}`;
    const cashier = await prisma.user.create({
      data: { username: 'correccion_cajero', passwordHash: admin.passwordHash },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('correccion_cajero', 'AdminPassword#2026')).rawToken}`;
    for (const roleName of ['cartera', 'compras', 'supervisor', 'inventario', 'tesoreria']) {
      const user = await prisma.user.create({
        data: { username: `correccion_${roleName}`, passwordHash: admin.passwordHash },
      });
      const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      roleCookies[roleName] =
        `${SESSION_COOKIE_NAME}=${(await auth.login(`correccion_${roleName}`, 'AdminPassword#2026')).rawToken}`;
    }
  }, 45000);

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "journal_entry_lines", "journal_entries", "company_accounting_mappings", "expense_payments", "expenses", "expense_categories", "payable_payments", "payables", "receivable_payments", "receivables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "treasury_documents", "document_locks", "audit_events", "cash_movements", "bank_movements", "bank_accounts", "customers", "purchase_lines", "purchases", "third_parties", "suppliers", "inventory_valuation_movements", "inventory_cost_balances", "inventory_movements", "inventory_lots", "locations", "product_presentations", "products", "categories", "accounts" CASCADE`;
    await prisma.$executeRaw`UPDATE "treasury_document_sequences" SET "last_value" = 0`;
    capitalAccountId = (await seedPurposeMappings()).CAPITAL;

    await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final',
        isDefault: true,
      },
    });
    customerId = (
      await prisma.customer.create({
        data: { documentNumber: '1030405060', name: 'Marta Crédito' },
      })
    ).id;
    supplierId = (
      await prisma.supplier.create({ data: { taxId: '900123456', name: 'Droguería Mayorista' } })
    ).id;
    const category = await prisma.category.create({ data: { name: 'Analgésicos' } });
    productId = (
      await prisma.product.create({
        data: {
          inventoryControlMode: 'LOT_EXPIRY',
          categoryId: category.id,
          code: 'MED-ACE-500',
          name: 'Acetaminofén 500mg',
          baseUnit: 'TABLETA',
          basePrice: new Prisma.Decimal('1000.00'),
          baseCost: new Prisma.Decimal('600.00'),
        },
      })
    ).id;
    const location = await prisma.location.create({
      data: { code: 'POS-01', name: 'Estante', isDefault: true },
    });
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 180);
    await prisma.inventoryLot.create({
      data: {
        controlMode: 'LOT_EXPIRY',
        productId,
        locationId: location.id,
        lotNumber: 'L-1',
        expirationDate: expiration,
        currentQuantity: 500,
        isActive: true,
      },
    });
    bankId = (
      await prisma.bankAccount.create({
        data: {
          bankName: 'Bancolombia',
          accountType: 'AHORROS',
          accountNumber: '680958',
          name: 'Recaudos',
          createdById: adminId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const post = (path: string, body: unknown, cookie = adminCookie, key: string = randomUUID()) =>
    request(app.getHttpServer())
      .post(`/api/v1/${path}`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send(body as object);

  async function creditSale(quantity: number) {
    const res = await post('sales/confirm', {
      paymentMethod: 'CREDITO',
      customerId,
      items: [{ productId, quantityCommercial: quantity }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return prisma.receivable.findUniqueOrThrow({ where: { saleId: res.body.id } });
  }

  async function payable(invoiceNumber: string, total: string) {
    const purchase = await prisma.purchase.create({
      data: {
        supplierId,
        invoiceNumber,
        purchaseDate: new Date('2026-10-01'),
        totalAmount: new Prisma.Decimal(total),
      },
    });
    return prisma.payable.create({
      data: {
        purchaseId: purchase.id,
        supplierId,
        totalAmount: new Prisma.Decimal(total),
        balance: new Prisma.Decimal(total),
        dueDate: new Date('2026-10-31'),
      },
    });
  }

  async function journalIsBalanced() {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT journal_entry_id AS id FROM journal_entry_lines
      GROUP BY journal_entry_id HAVING SUM(debit) <> SUM(credit)
    `;
    return rows.length === 0;
  }

  const cashBalance = async () => {
    const last = await prisma.cashMovement.findFirst({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return last ? last.balanceAfter.toFixed(2) : '0.00';
  };
  const balanceOf = async (id: string) =>
    (await prisma.receivable.findUniqueOrThrow({ where: { id } })).balance.toFixed(2);
  const correct = (id: string, body: unknown, cookie = adminCookie, key: string = randomUUID()) =>
    post(`treasury/documents/${id}/correct`, body, cookie, key);

  async function collection(receivableId: string, amount: string) {
    const res = await post('treasury/cash-receipts/collections', {
      kind: 'CARTERA',
      paymentMethod: 'EFECTIVO',
      concept: 'Abono cliente Marta',
      customerId,
      applications: [{ receivableId, amount }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; documentNumber: string };
  }

  /** Estado de todo lo que una corrección fallida no debe tocar */
  const snapshot = async () => ({
    documents: await prisma.treasuryDocument.findMany({
      select: { id: true, status: true, amount: true },
      orderBy: { documentNumber: 'asc' },
    }),
    cash: await prisma.cashMovement.count(),
    bank: await prisma.bankMovement.count(),
    entries: await prisma.journalEntry.count(),
    receivables: await prisma.receivable.findMany({
      select: { id: true, balance: true },
      orderBy: { id: 'asc' },
    }),
    payables: await prisma.payable.findMany({
      select: { id: true, balance: true },
      orderBy: { id: 'asc' },
    }),
  });

  it('corrige un abono de efectivo a transferencia por otro valor: saldos, asientos y vínculo', async () => {
    const receivable = await creditSale(10); // 10.000 a crédito
    const original = await collection(receivable.id, '4000.00');
    expect(await balanceOf(receivable.id)).toBe('6000.00');
    expect(await cashBalance()).toBe('4000.00');

    const key = randomUUID();
    const body = {
      reason: 'El cliente pagó por transferencia y fueron 3.000',
      replacement: {
        kind: 'CARTERA',
        paymentMethod: 'TRANSFERENCIA',
        bankAccountId: bankId,
        concept: `Abono cliente Marta (Corrección de ${original.documentNumber})`,
        customerId,
        applications: [{ receivableId: receivable.id, amount: '3000.00' }],
      },
    };
    const res = await correct(original.id, body, adminCookie, key);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      documentNumber: 'RC-000002',
      status: 'VIGENTE',
      origin: 'CARTERA',
      amount: '3000.00',
      source: 'BANCO',
    });

    // El original queda anulado y nombra su reemplazo
    const annulled = await prisma.treasuryDocument.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(annulled.status).toBe('ANULADO');
    expect(annulled.cancellationReason).toBe(
      'Corregido con RC-000002: El cliente pagó por transferencia y fueron 3.000',
    );

    // Cartera: se reversa el abono de 4.000 y se aplica el de 3.000
    expect(await balanceOf(receivable.id)).toBe('7000.00');
    const payments = await prisma.receivablePayment.findMany({
      where: { receivableId: receivable.id },
    });
    expect(payments.filter((p) => p.isReversed).map((p) => p.amount.toFixed(2))).toEqual([
      '4000.00',
    ]);
    expect(payments.filter((p) => !p.isReversed).map((p) => p.amount.toFixed(2))).toEqual([
      '3000.00',
    ]);
    // Caja devuelve los 4.000; el banco recibe los 3.000
    expect(await cashBalance()).toBe('0.00');
    expect(
      (
        await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } })
      ).currentBalance.toFixed(2),
    ).toBe('3000.00');
    expect(await journalIsBalanced()).toBe(true);
    expect(await prisma.journalEntry.count({ where: { sourceType: 'REVERSAL' } })).toBeGreaterThan(
      0,
    );
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'treasury:document_corrected', entityId: original.id },
    });
    expect(audit.details).toMatchObject({ replacementNumber: 'RC-000002' });

    // Reintento con la misma clave: misma respuesta, nada se repite
    const before = await snapshot();
    const retry = await correct(original.id, body, adminCookie, key);
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(res.body.id);
    expect(await snapshot()).toEqual(before);

    // Con otra clave, el original ya está anulado: 409 sin efectos
    const again = await correct(original.id, body);
    expect(again.status).toBe(409);
    expect(await snapshot()).toEqual(before);
  });

  it('si el reemplazo se rechaza, el original sigue vigente y nada cambia', async () => {
    const receivable = await creditSale(10);
    const original = await collection(receivable.id, '4000.00');
    const before = await snapshot();

    const tooMuch = await correct(original.id, {
      reason: 'Abono mal digitado',
      replacement: {
        kind: 'CARTERA',
        paymentMethod: 'EFECTIVO',
        concept: 'Abono corregido',
        customerId,
        applications: [{ receivableId: receivable.id, amount: '20000.00' }],
      },
    });
    expect(tooMuch.status).toBe(400);
    expect(await snapshot()).toEqual(before);
    expect(
      (await prisma.treasuryDocument.findUniqueOrThrow({ where: { id: original.id } })).status,
    ).toBe('VIGENTE');
  });

  it('respeta el bloqueo de documentos: la corrección no se registra y el original sigue vigente', async () => {
    const receivable = await creditSale(10);
    const original = await collection(receivable.id, '4000.00');
    await prisma.documentLock.create({
      data: {
        lockedThrough: new Date(`${businessToday()}T00:00:00Z`),
        reason: 'Corte revisado',
        createdById: adminId,
      },
    });
    const before = await snapshot();

    const res = await correct(original.id, {
      reason: 'Abono mal digitado',
      replacement: {
        kind: 'CARTERA',
        paymentMethod: 'EFECTIVO',
        concept: 'Abono corregido',
        customerId,
        applications: [{ receivableId: receivable.id, amount: '3000.00' }],
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.message).toMatch(/bloqueados/);
    expect(await snapshot()).toEqual(before);
  });

  it('corrige un egreso manual: reversa su asiento contra la contrapartida y registra el nuevo', async () => {
    await post('treasury/cash-receipts', {
      kind: 'MANUAL',
      paymentMethod: 'EFECTIVO',
      concept: 'Base de caja',
      amount: '100000.00',
      counterpartAccountId: capitalAccountId,
    }).expect(201);
    const disbursement = await post('treasury/disbursements', {
      kind: 'MANUAL',
      paymentMethod: 'EFECTIVO',
      concept: 'Retiro de socio',
      amount: '20000.00',
      counterpartAccountId: capitalAccountId,
    });
    expect(disbursement.status, JSON.stringify(disbursement.body)).toBe(201);
    expect(await cashBalance()).toBe('80000.00');

    const res = await correct(disbursement.body.id, {
      reason: 'El retiro fue de 15.000',
      replacement: {
        kind: 'MANUAL',
        paymentMethod: 'EFECTIVO',
        concept: 'Retiro de socio (Corrección de CE-000001)',
        amount: '15000.00',
        counterpartAccountId: capitalAccountId,
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ documentNumber: 'CE-000002', amount: '15000.00' });
    expect(await cashBalance()).toBe('85000.00');
    const movement = await prisma.cashMovement.findFirstOrThrow({
      where: {
        referenceDocumentId: disbursement.body.id,
        referenceDocumentType: 'TREASURY_DOCUMENT',
      },
    });
    const entry = await prisma.journalEntry.findUniqueOrThrow({
      where: { sourceType_sourceId: { sourceType: 'CASH_MOVEMENT', sourceId: movement.id } },
    });
    expect(await prisma.journalEntry.count({ where: { reversalOfId: entry.id } })).toBe(1);
    // Capital neto: +100.000 del aporte, -15.000 del retiro corregido
    const capital = await prisma.journalEntryLine.aggregate({
      where: { accountId: capitalAccountId },
      _sum: { debit: true, credit: true },
    });
    expect(Number(capital._sum.credit ?? 0) - Number(capital._sum.debit ?? 0)).toBe(85000);
    expect(await journalIsBalanced()).toBe(true);
  });

  it('conserva tipo, origen y tercero; exige permisos; el automático se corrige desde su origen', async () => {
    const receivable = await creditSale(10);
    const original = await collection(receivable.id, '4000.00');
    const replacement = {
      kind: 'CARTERA',
      paymentMethod: 'EFECTIVO',
      concept: 'Abono corregido',
      customerId,
      applications: [{ receivableId: receivable.id, amount: '3000.00' }],
    };
    const before = await snapshot();

    const otherKind = await correct(original.id, {
      reason: 'Cambio de tipo',
      replacement: {
        ...replacement,
        kind: 'MANUAL',
        amount: '3000.00',
        counterpartAccountId: capitalAccountId,
      },
    });
    expect(otherKind.status).toBe(400);
    expect(otherKind.body.message).toMatch(/mismo origen/);

    const other = await prisma.customer.create({ data: { documentNumber: '77', name: 'Otro' } });
    const otherCustomer = await correct(original.id, {
      reason: 'Cambio de cliente',
      replacement: { ...replacement, customerId: other.id },
    });
    expect(otherCustomer.status).toBe(400);
    expect(otherCustomer.body.message).toMatch(/conserva el cliente/);

    const shortReason = await correct(original.id, { reason: 'x', replacement });
    expect(shortReason.status).toBe(400);

    // Cartera registra abonos pero no anula: no puede corregir
    const forbidden = await correct(
      original.id,
      { reason: 'Sin permiso de anular', replacement },
      roleCookies.cartera,
    );
    expect(forbidden.status).toBe(403);

    const missingKey = await request(app.getHttpServer())
      .post(`/api/v1/treasury/documents/${original.id}/correct`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Sin clave de idempotencia', replacement });
    expect(missingKey.status).toBe(400);
    expect(await snapshot()).toEqual(before);

    // Un comprobante automático (lo emitió otro documento, p. ej. el reembolso de una nota
    // crédito) se corrige desde su origen
    // (el trigger de caja lo emite para un movimiento con esa referencia)
    const refund = await prisma.cashMovement.create({
      data: {
        movementType: 'EGRESO_MANUAL',
        amount: new Prisma.Decimal('1000.00'),
        reason: 'Reembolso de devolución',
        referenceDocumentType: 'CREDIT_NOTE',
        referenceDocumentId: 'NC-000001',
        balanceAfter: new Prisma.Decimal('3000.00'),
        createdByUserId: adminId,
      },
    });
    const automatic = await prisma.treasuryDocument.findUniqueOrThrow({
      where: { cashMovementId: refund.id },
    });
    expect(automatic.origin).toBe('AUTOMATICO');
    const blocked = await correct(automatic.id, { reason: 'Corrección automática', replacement });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/desde el documento de origen/);
  });

  it('corrige un pago a proveedor: la cuenta por pagar queda con el valor corregido', async () => {
    await post('treasury/cash-receipts', {
      kind: 'MANUAL',
      paymentMethod: 'EFECTIVO',
      concept: 'Base de caja',
      amount: '100000.00',
      counterpartAccountId: capitalAccountId,
    }).expect(201);
    const debt = await payable('FAC-900', '50000.00');
    const paid = await post('treasury/disbursements', {
      kind: 'PROVEEDOR',
      paymentMethod: 'EFECTIVO',
      concept: 'Pago FAC-900',
      supplierId,
      applications: [{ documentType: 'FACTURA_COMPRA', documentId: debt.id, amount: '30000.00' }],
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);

    const res = await correct(paid.body.id, {
      reason: 'El pago fue de 20.000',
      replacement: {
        kind: 'PROVEEDOR',
        paymentMethod: 'EFECTIVO',
        concept: 'Pago FAC-900 (Corrección de CE-000001)',
        supplierId,
        applications: [{ documentType: 'FACTURA_COMPRA', documentId: debt.id, amount: '20000.00' }],
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(
      (await prisma.payable.findUniqueOrThrow({ where: { id: debt.id } })).balance.toFixed(2),
    ).toBe('30000.00');
    expect(await cashBalance()).toBe('80000.00');
    expect(await journalIsBalanced()).toBe(true);

    const otherSupplier = await prisma.supplier.create({
      data: { taxId: '800', name: 'Otro proveedor' },
    });
    const wrong = await correct(res.body.id, {
      reason: 'Cambio de proveedor',
      replacement: {
        kind: 'PROVEEDOR',
        paymentMethod: 'EFECTIVO',
        concept: 'Pago',
        supplierId: otherSupplier.id,
        applications: [{ documentType: 'FACTURA_COMPRA', documentId: debt.id, amount: '20000.00' }],
      },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toMatch(/conserva el proveedor/);
  });
});
