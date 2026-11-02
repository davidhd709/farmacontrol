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
 * Correcciones del cliente, fase 5: auditoría contable (descuadrados y anulados) y estado de
 * cuenta automático por tercero.
 */
describe('Auditoría contable y estado de cuenta por tercero', () => {
  let app: INestApplication;
  let cookie: string;
  let adminId: string;
  let customerId: string;
  let supplierId: string;
  let thirdPartyId: string;
  let productId: string;
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
    const admin = await provisioning.provisionInitialUser({ username: 'auditora', password: 'AdminPassword#2026' });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    cookie = `${SESSION_COOKIE_NAME}=${(await auth.login('auditora', 'AdminPassword#2026')).rawToken}`;
  }, 45000);

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "journal_entry_lines", "journal_entries", "company_accounting_mappings", "receivable_payments", "receivables", "payable_payments", "payables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "treasury_documents", "cash_movements", "customers", "purchases", "third_parties", "suppliers", "inventory_valuation_movements", "inventory_cost_balances", "inventory_movements", "inventory_lots", "locations", "products", "categories", "accounts" CASCADE`;
    await prisma.$executeRaw`UPDATE "treasury_document_sequences" SET "last_value" = 0`;
    capitalAccountId = (await seedPurposeMappings()).CAPITAL;
    await prisma.customer.create({ data: { documentNumber: '222222222222', name: 'Consumidor Final', isDefault: true } });
    customerId = (await prisma.customer.create({ data: { documentNumber: '900777', name: 'Clínica Aliada' } })).id;
    supplierId = (await prisma.supplier.create({ data: { taxId: '900777', name: 'Clínica Aliada' } })).id;
    thirdPartyId = (
      await prisma.thirdParty.create({
        data: {
          documentType: 'NIT',
          documentNumber: '900777',
          name: 'Clínica Aliada',
          isCustomer: true,
          isSupplier: true,
          customerId,
          supplierId,
        },
      })
    ).id;
    const category = await prisma.category.create({ data: { name: 'Analgésicos' } });
    productId = (
      await prisma.product.create({
        data: {
          inventoryControlMode: 'LOT_EXPIRY',
          categoryId: category.id,
          code: 'MED-1',
          name: 'Acetaminofén',
          baseUnit: 'TABLETA',
          basePrice: new Prisma.Decimal('1000.00'),
          baseCost: new Prisma.Decimal('600.00'),
        },
      })
    ).id;
    const location = await prisma.location.create({ data: { code: 'POS', name: 'Estante', isDefault: true } });
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 200);
    await prisma.inventoryLot.create({
      data: { controlMode: 'LOT_EXPIRY', productId, locationId: location.id, lotNumber: 'L1', expirationDate: expiration, currentQuantity: 100, isActive: true },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/api/v1/${path}`).set('Cookie', cookie).set('Idempotency-Key', randomUUID()).send(body);
  const audit = (query: string) =>
    request(app.getHttpServer()).get(`/api/v1/accounting/audit?${query}`).set('Cookie', cookie);

  async function creditSaleAndReceipt() {
    const sale = await post('sales/confirm', {
      paymentMethod: 'CREDITO',
      customerId,
      items: [{ productId, quantityCommercial: 10 }],
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { saleId: sale.body.id } });
    const receipt = await post('treasury/cash-receipts', {
      kind: 'CARTERA',
      paymentMethod: 'EFECTIVO',
      concept: 'Abono Clínica',
      customerId,
      applications: [{ receivableId: receivable.id, amount: '4000.00' }],
    });
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(201);
    return { receivable };
  }

  it('los documentos nuevos no quedan descuadrados; un asiento histórico descuadrado y un recibo mal aplicado sí aparecen', async () => {
    await creditSaleAndReceipt();
    const clean = await audit('view=DESCUADRADOS').expect(200);
    expect(clean.body.items).toEqual([]);
    expect(clean.body).toMatchObject({ truncated: false, maxRows: 500 });
    expect(clean.body.documentTypes).toEqual(expect.arrayContaining(['SALE', 'RECEIVABLE_PAYMENT']));

    // Un asiento histórico descuadrado (la base hoy lo rechaza al confirmar la transacción)
    const account = await prisma.account.findFirstOrThrow({ where: { id: capitalAccountId } });
    await prisma.$executeRawUnsafe('ALTER TABLE journal_entries DISABLE TRIGGER USER');
    await prisma.$executeRawUnsafe('ALTER TABLE journal_entry_lines DISABLE TRIGGER USER');
    try {
      await prisma.journalEntry.create({
        data: {
          entryDate: new Date('2026-09-15'),
          description: 'Asiento migrado descuadrado',
          sourceType: 'LEGACY_IMPORT',
          sourceId: 'L-1',
          status: 'POSTED',
          postedAt: new Date('2026-09-15T12:00:00Z'),
          lines: {
            create: [
              { position: 1, accountId: account.id, debit: new Prisma.Decimal('100.00'), credit: new Prisma.Decimal('0') },
              { position: 2, accountId: account.id, debit: new Prisma.Decimal('0'), credit: new Prisma.Decimal('90.00') },
            ],
          },
        },
      });
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE journal_entries ENABLE TRIGGER USER');
      await prisma.$executeRawUnsafe('ALTER TABLE journal_entry_lines ENABLE TRIGGER USER');
    }

    // Un recibo de cartera cuyo valor no coincide con lo que aplica
    const movement = await prisma.cashMovement.create({
      data: {
        movementType: 'INGRESO_MANUAL',
        amount: new Prisma.Decimal('5000.00'),
        reason: 'Recibo sin aplicar',
        referenceDocumentType: 'TREASURY_DOCUMENT',
        referenceDocumentId: 'x',
        balanceAfter: new Prisma.Decimal('0'),
        createdByUserId: adminId,
      },
    });
    await prisma.treasuryDocument.create({
      data: {
        documentType: 'RECIBO_CAJA',
        documentNumber: 'RC-999999',
        documentDate: new Date('2026-10-20'),
        amount: new Prisma.Decimal('5000.00'),
        paymentMethod: 'EFECTIVO',
        concept: 'Recibo sin aplicar',
        origin: 'CARTERA',
        customerId,
        cashMovementId: movement.id,
        createdById: adminId,
      },
    });

    const all = await audit('view=DESCUADRADOS').expect(200);
    expect(all.body.items.map((i: { documentType: string; difference: string }) => [i.documentType, i.difference]).sort()).toEqual([
      ['LEGACY_IMPORT', '10.00'],
      ['TREASURY_DOCUMENT', '5000.00'],
    ]);
    const filtered = await audit('view=DESCUADRADOS&documentType=LEGACY_IMPORT&fromDate=2026-09-01&toDate=2026-09-30').expect(200);
    expect(filtered.body.items).toHaveLength(1);
    expect((await audit('view=DESCUADRADOS&fromDate=2026-09-16&documentType=LEGACY_IMPORT').expect(200)).body.items).toHaveLength(0);
  });

  it('los anulados muestran el documento reversado con fecha y motivo, filtrables por tipo', async () => {
    const { receivable } = await creditSaleAndReceipt();
    const payment = await prisma.receivablePayment.findFirstOrThrow({ where: { receivableId: receivable.id } });
    await request(app.getHttpServer())
      .post(`/api/v1/receivables/${receivable.id}/payments/${payment.id}/reverse`)
      .set('Cookie', cookie)
      .send({ reason: 'Consignación devuelta por el banco' })
      .expect(200);

    const res = await audit('view=ANULADOS').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      documentType: 'RECEIVABLE_PAYMENT',
      documentId: payment.id,
      reversalReason: 'Consignación devuelta por el banco',
      difference: '0.00',
    });
    expect((await audit('view=ANULADOS&documentType=SALE').expect(200)).body.items).toHaveLength(0);
    await audit('view=OTRA').expect(400);
  });

  it('el estado de cuenta del tercero suma lo que nos debe y lo que le debemos', async () => {
    await creditSaleAndReceipt();
    const purchase = await prisma.purchase.create({
      data: { supplierId, invoiceNumber: 'FC-1', purchaseDate: new Date('2026-10-01'), totalAmount: new Prisma.Decimal('2500.00') },
    });
    await prisma.payable.create({
      data: {
        purchaseId: purchase.id,
        supplierId,
        totalAmount: new Prisma.Decimal('2500.00'),
        balance: new Prisma.Decimal('2500.00'),
        dueDate: new Date('2026-10-31'),
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/third-parties/${thirdPartyId}/statement`)
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toMatchObject({
      name: 'Clínica Aliada',
      isCustomer: true,
      isSupplier: true,
      totalOwedToUs: '6000.00',
      totalWeOwe: '2500.00',
      netBalance: '3500.00',
    });
    expect(res.body.receivables.items[0]).toMatchObject({ balance: '6000.00', agingBucket: 'CORRIENTE' });
    expect(res.body.payables.items[0]).toMatchObject({ documentNumber: 'FC-1', balance: '2500.00' });
    await request(app.getHttpServer())
      .get(`/api/v1/third-parties/${randomUUID()}/statement`)
      .set('Cookie', cookie)
      .expect(404);
  });
});
