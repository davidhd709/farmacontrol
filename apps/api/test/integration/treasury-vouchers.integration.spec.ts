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

/**
 * Correcciones del cliente, fase 3: el recibo de caja y el comprobante de egreso son el
 * documento de origen. Un documento = un movimiento de caja o banco por el total, un abono o
 * pago por factura y asientos cuadrados; caja, bancos, cartera y cuentas por pagar se
 * alimentan de él.
 */
describe('Recibos de caja y comprobantes de egreso como documento de origen', () => {
  let app: INestApplication;
  let adminCookie: string;
  let cashierCookie: string;
  let collectorCookie: string;
  let adminId: string;
  let customerId: string;
  let supplierId: string;
  let productId: string;
  let bankId: string;
  let capitalAccountId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    const provisioning = module.get(UserProvisioningService);
    const auth = module.get(AuthService);

    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await provisioning.provisionInitialUser({ username: 'tesoreria_admin', password: 'AdminPassword#2026' });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('tesoreria_admin', 'AdminPassword#2026')).rawToken}`;
    const cashier = await prisma.user.create({ data: { username: 'tesoreria_cajero', passwordHash: admin.passwordHash } });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('tesoreria_cajero', 'AdminPassword#2026')).rawToken}`;
    // Rol cartera: gestiona cuentas por cobrar pero no mueve caja ni bancos
    const collector = await prisma.user.create({ data: { username: 'tesoreria_cartera', passwordHash: admin.passwordHash } });
    const collectorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cartera' } });
    await prisma.userRole.create({ data: { userId: collector.id, roleId: collectorRole.id } });
    collectorCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('tesoreria_cartera', 'AdminPassword#2026')).rawToken}`;
  }, 45000);

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "journal_entry_lines", "journal_entries", "company_accounting_mappings", "expense_payments", "expenses", "expense_categories", "payable_payments", "payables", "receivable_payments", "receivables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "treasury_documents", "cash_movements", "bank_movements", "bank_accounts", "customers", "purchase_lines", "purchases", "third_parties", "suppliers", "inventory_valuation_movements", "inventory_cost_balances", "inventory_movements", "inventory_lots", "locations", "product_presentations", "products", "categories", "accounts" CASCADE`;
    await prisma.$executeRaw`UPDATE "treasury_document_sequences" SET "last_value" = 0`;
    capitalAccountId = (await seedPurposeMappings()).CAPITAL;

    await prisma.customer.create({
      data: { documentType: 'CC', documentNumber: '222222222222', name: 'Consumidor Final', isDefault: true },
    });
    customerId = (await prisma.customer.create({ data: { documentNumber: '1030405060', name: 'Marta Crédito' } })).id;
    supplierId = (await prisma.supplier.create({ data: { taxId: '900123456', name: 'Droguería Mayorista' } })).id;
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
    const location = await prisma.location.create({ data: { code: 'POS-01', name: 'Estante', isDefault: true } });
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
      data: { supplierId, invoiceNumber, purchaseDate: new Date('2026-10-01'), totalAmount: new Prisma.Decimal(total) },
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

  async function causation(total: string) {
    const account = await prisma.account.create({
      data: { code: '513525', name: 'ENERGIA', type: 'EXPENSE', level: 1, allowsMovement: true },
    });
    const category = await prisma.expenseCategory.create({ data: { name: 'Servicios', accountId: account.id } });
    return prisma.expense.create({
      data: {
        categoryId: category.id,
        description: 'Arriendo bodega',
        beneficiary: 'Droguería Mayorista',
        supplierId,
        documentNumber: 'FV-88',
        amount: new Prisma.Decimal(total),
        balance: new Prisma.Decimal(total),
        expenseDate: new Date('2026-10-05'),
        paymentMethod: 'CREDITO',
        status: 'PENDIENTE',
        createdById: adminId,
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

  it('venta a crédito → recibo de caja que abona dos facturas → saldo baja, "Ver abonos" lo muestra y entra a caja', async () => {
    const first = await creditSale(10);
    const second = await creditSale(5);

    const receipt = await post('treasury/cash-receipts', {
      kind: 'CARTERA',
      paymentMethod: 'EFECTIVO',
      concept: 'Abono cliente Marta',
      customerId,
      applications: [
        { receivableId: first.id, amount: '4000.00' },
        { receivableId: second.id, amount: '5000.00' },
      ],
    });
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(201);
    expect(receipt.body).toMatchObject({
      documentType: 'RECIBO_CAJA',
      documentNumber: 'RC-000001',
      origin: 'CARTERA',
      amount: '9000.00',
      source: 'CAJA',
      thirdPartyName: 'Marta Crédito',
    });
    expect(receipt.body.applications).toHaveLength(2);

    expect((await prisma.receivable.findUniqueOrThrow({ where: { id: first.id } })).balance.toFixed(2)).toBe('6000.00');
    const paid = await prisma.receivable.findUniqueOrThrow({ where: { id: second.id } });
    expect(paid.status).toBe('PAGADA');

    // Un solo movimiento de caja por el total, sin un segundo recibo del trigger
    const cash = await prisma.cashMovement.findMany();
    expect(cash).toHaveLength(1);
    expect(cash[0].amount.toFixed(2)).toBe('9000.00');
    expect(cash[0].referenceDocumentId).toBe(receipt.body.id);
    expect(await prisma.treasuryDocument.count()).toBe(1);

    const statement = await request(app.getHttpServer())
      .get(`/api/v1/receivables/${first.id}/movements`)
      .set('Cookie', adminCookie)
      .expect(200);
    const abono = statement.body.data.movements.find((m: { type: string }) => m.type === 'ABONO');
    expect(abono).toMatchObject({ documentNumber: 'RC-000001', credit: '4000.00', balance: '6000.00' });

    const cashList = await request(app.getHttpServer()).get('/api/v1/cash-movements').set('Cookie', adminCookie).expect(200);
    expect(cashList.body.items[0].amount).toBe(9000);
    expect(await journalIsBalanced()).toBe(true);
  });

  it('el abono por transferencia entra a bancos y rechaza facturas de otro cliente sin dejar rastro', async () => {
    const receivable = await creditSale(3);
    const other = await prisma.customer.create({ data: { documentNumber: '99', name: 'Otro' } });

    const wrong = await post('treasury/cash-receipts', {
      kind: 'CARTERA',
      paymentMethod: 'EFECTIVO',
      concept: 'Abono equivocado',
      customerId: other.id,
      applications: [{ receivableId: receivable.id, amount: '1000.00' }],
    });
    expect(wrong.status).toBe(400);
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.treasuryDocument.count()).toBe(0);

    const transfer = await post('treasury/cash-receipts', {
      kind: 'CARTERA',
      paymentMethod: 'TRANSFERENCIA',
      bankAccountId: bankId,
      concept: 'Transferencia Nequi',
      customerId,
      applications: [{ receivableId: receivable.id, amount: '3000.00' }],
    });
    expect(transfer.status, JSON.stringify(transfer.body)).toBe(201);
    expect(transfer.body.source).toBe('BANCO');
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance.toFixed(2)).toBe('3000.00');
    expect(await prisma.bankMovement.count()).toBe(1);
    expect(await prisma.treasuryDocument.count()).toBe(1);
  });

  it('el recibo manual contabiliza contra la contrapartida y es idempotente', async () => {
    const key = randomUUID();
    const body = {
      kind: 'MANUAL',
      paymentMethod: 'EFECTIVO',
      concept: 'Aporte de socio a caja',
      amount: '150000.00',
      counterpartAccountId: capitalAccountId,
    };
    const first = await post('treasury/cash-receipts', body, adminCookie, key);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const retry = await post('treasury/cash-receipts', body, adminCookie, key);
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(await prisma.cashMovement.count()).toBe(1);
    expect(first.body.counterpartAccount).toMatch(/Prueba CAPITAL/);

    const entry = await prisma.journalEntry.findFirstOrThrow({ include: { lines: true } });
    const credit = entry.lines.find((l) => l.accountId === capitalAccountId)!;
    expect(credit.credit.toFixed(2)).toBe('150000.00');
    expect(await journalIsBalanced()).toBe(true);

    const missing = await post('treasury/cash-receipts', { ...body, counterpartAccountId: undefined });
    expect(missing.status).toBe(400);
  });

  it('causación y factura de compra → comprobante de egreso seleccionando ambas → quedan saldadas', async () => {
    await post('treasury/cash-receipts', {
      kind: 'MANUAL',
      paymentMethod: 'EFECTIVO',
      concept: 'Base de caja',
      amount: '500000.00',
      counterpartAccountId: capitalAccountId,
    }).expect(201);
    const invoice = await payable('FC-100', '200000.00');
    const expense = await causation('80000.00');

    const statementBefore = await request(app.getHttpServer())
      .get(`/api/v1/payables/statement?supplierId=${supplierId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(statementBefore.body.data.items.map((i: { documentType: string }) => i.documentType).sort()).toEqual([
      'CAUSACION_GASTO',
      'FACTURA_COMPRA',
    ]);
    expect(statementBefore.body.data.aging.totalPending).toBe('280000.00');

    const insufficient = await post('treasury/disbursements', {
      kind: 'PROVEEDOR',
      paymentMethod: 'TRANSFERENCIA',
      bankAccountId: bankId,
      concept: 'Pago sin fondos',
      supplierId,
      applications: [{ documentType: 'FACTURA_COMPRA', documentId: invoice.id, amount: '200000.00' }],
    });
    expect(insufficient.status).toBe(409);
    expect((await prisma.payable.findUniqueOrThrow({ where: { id: invoice.id } })).balance.toFixed(2)).toBe('200000.00');

    const voucher = await post('treasury/disbursements', {
      kind: 'PROVEEDOR',
      paymentMethod: 'EFECTIVO',
      concept: 'Pago octubre',
      supplierId,
      applications: [
        { documentType: 'FACTURA_COMPRA', documentId: invoice.id, amount: '200000.00' },
        { documentType: 'CAUSACION_GASTO', documentId: expense.id, amount: '80000.00' },
      ],
    });
    expect(voucher.status, JSON.stringify(voucher.body)).toBe(201);
    expect(voucher.body).toMatchObject({
      documentType: 'COMPROBANTE_EGRESO',
      documentNumber: 'CE-000001',
      origin: 'PROVEEDOR',
      amount: '280000.00',
      thirdPartyName: 'Droguería Mayorista',
    });

    expect((await prisma.payable.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('PAGADA');
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).status).toBe('PAGADO');
    const expensePayment = await prisma.expensePayment.findFirstOrThrow();
    expect(expensePayment.treasuryDocumentId).toBe(voucher.body.id);

    const statementAfter = await request(app.getHttpServer())
      .get(`/api/v1/payables/statement?supplierId=${supplierId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(statementAfter.body.data.items).toHaveLength(0);
    const withPaid = await request(app.getHttpServer())
      .get(`/api/v1/payables/statement?supplierId=${supplierId}&includePaid=true`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(withPaid.body.data.items.every((i: { balance: string }) => i.balance === '0.00')).toBe(true);

    const balance = await request(app.getHttpServer()).get('/api/v1/cash-movements/balance').set('Cookie', adminCookie).expect(200);
    expect(balance.body.currentBalance).toBe(220000);
    expect(await journalIsBalanced()).toBe(true);
  });

  it('valida permisos por tipo de documento y exige filtro en el estado de cuenta', async () => {
    const receivable = await creditSale(1);
    const denied = await post(
      'treasury/disbursements',
      {
        kind: 'MANUAL',
        paymentMethod: 'TRANSFERENCIA',
        bankAccountId: bankId,
        concept: 'Retiro',
        amount: '1000.00',
        counterpartAccountId: capitalAccountId,
      },
      cashierCookie,
    );
    expect(denied.status).toBe(403);
    expect(receivable.balance.toFixed(2)).toBe('1000.00');
    await request(app.getHttpServer()).get('/api/v1/payables/statement').set('Cookie', adminCookie).expect(400);
    await post('treasury/cash-receipts', { kind: 'MANUAL', paymentMethod: 'EFECTIVO', concept: 'x', amount: '1' }, adminCookie, '').expect(400);
  });

  it('ruta antigua y recibo aplican la misma regla: el permiso de cartera autoriza el abono, no el ingreso manual', async () => {
    const receivable = await creditSale(2);
    const abono = await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivable.id}/payments`)
      .set('Cookie', collectorCookie)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: 1000, paymentMethod: 'EFECTIVO' });
    expect(abono.status, JSON.stringify(abono.body)).toBe(201);
    expect((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).balance.toFixed(2)).toBe('1000.00');

    // El cajero mueve caja pero no bancos: un egreso manual por transferencia se rechaza
    const manual = await post(
      'treasury/disbursements',
      { kind: 'MANUAL', paymentMethod: 'TRANSFERENCIA', bankAccountId: bankId, concept: 'Retiro', amount: '500.00', counterpartAccountId: capitalAccountId },
      cashierCookie,
    );
    expect(manual.status).toBe(403);
  });

  it('dos recibos simultáneos con la misma clave registran un solo documento y la misma respuesta', async () => {
    const key = randomUUID();
    const body = {
      kind: 'MANUAL',
      paymentMethod: 'EFECTIVO',
      concept: 'Aporte simultáneo',
      amount: '1000.00',
      counterpartAccountId: capitalAccountId,
    };
    const [first, second] = await Promise.all([
      post('treasury/cash-receipts', body, adminCookie, key),
      post('treasury/cash-receipts', body, adminCookie, key),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.treasuryDocument.count()).toBe(1);
    expect(await prisma.cashMovement.count()).toBe(1);
  });
});
