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
 * Correcciones del cliente (2026-11-02): "Reversar" sale del Libro Diario y cada documento se
 * corrige con su propia anulación. Aquí, las que faltaban: nota crédito, recibo de caja y
 * comprobante de egreso (abono, pago a proveedor y manual). Cada una deja inventario, dinero,
 * cartera o cuentas por pagar como antes del documento y el asiento reversado.
 */
describe('Anulación de nota crédito, recibo de caja y comprobante de egreso', () => {
  let app: INestApplication;
  let adminCookie: string;
  const roleCookies: Record<string, string> = {};
  let adminId: string;
  let customerId: string;
  let supplierId: string;
  let productId: string;
  let lotId: string;
  let capitalAccountId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await cleanTestDatabase();
    await seedRbac(prisma);
    const auth = module.get(AuthService);
    const admin = await module
      .get(UserProvisioningService)
      .provisionInitialUser({ username: 'anula_admin', password: 'AdminPassword#2026' });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('anula_admin', 'AdminPassword#2026')).rawToken}`;
    for (const roleName of ['cartera', 'compras', 'cajero', 'supervisor']) {
      const user = await prisma.user.create({ data: { username: `anula_${roleName}`, passwordHash: admin.passwordHash } });
      const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      roleCookies[roleName] = `${SESSION_COOKIE_NAME}=${(await auth.login(`anula_${roleName}`, 'AdminPassword#2026')).rawToken}`;
    }
  }, 45000);

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "journal_entry_lines", "journal_entries", "company_accounting_mappings", "credit_note_lines", "credit_notes", "expense_payments", "expenses", "expense_categories", "payable_payments", "payables", "receivable_payments", "receivables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "treasury_documents", "cash_movements", "bank_movements", "bank_accounts", "customers", "purchase_lines", "purchases", "third_parties", "suppliers", "inventory_valuation_movements", "inventory_cost_layers", "inventory_cost_balances", "inventory_movements", "inventory_lots", "locations", "product_presentations", "products", "categories", "accounts" CASCADE`;
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
    lotId = (
      await prisma.inventoryLot.create({
        data: {
          controlMode: 'LOT_EXPIRY',
          productId,
          locationId: location.id,
          lotNumber: 'L-1',
          expirationDate: expiration,
          currentQuantity: 100,
          isActive: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const post = (path: string, body: unknown, cookie = adminCookie) =>
    request(app.getHttpServer())
      .post(`/api/v1/${path}`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send(body as object);

  const lotQuantity = async () => (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } })).currentQuantity;
  const cashBalance = async () => {
    const last = await prisma.cashMovement.findFirst({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return last ? last.balanceAfter.toFixed(2) : '0.00';
  };

  async function journalIsBalanced() {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT journal_entry_id AS id FROM journal_entry_lines
      GROUP BY journal_entry_id HAVING SUM(debit) <> SUM(credit)
    `;
    return rows.length === 0;
  }

  /** Inventario en el mayor y en el submayor de valoración. */
  async function inventoryState() {
    const mapping = await prisma.companyAccountingMapping.findFirstOrThrow({ where: { purpose: 'INVENTORY', status: 'ACTIVE' } });
    const [ledger] = await prisma.$queryRaw<Array<{ value: Prisma.Decimal | null }>>`
      SELECT SUM(l.debit - l.credit) AS value FROM journal_entry_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id AND j.status = 'POSTED'
      WHERE l.account_id = ${mapping.accountId}::uuid
    `;
    const balance = await prisma.inventoryCostBalance.findUnique({ where: { productId } });
    return {
      ledger: (ledger.value ?? new Prisma.Decimal(0)).toFixed(2),
      valuation: balance ? balance.totalValue.toFixed(2) : '0.00',
    };
  }

  async function sale(paymentMethod: 'EFECTIVO' | 'CREDITO', quantity: number) {
    const res = await post('sales/confirm', {
      paymentMethod,
      customerId,
      ...(paymentMethod === 'EFECTIVO' ? { amountPaid: quantity * 1000 } : {}),
      items: [{ productId, quantityCommercial: quantity }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; invoiceNumber: string; lines: Array<{ id: string }> };
  }

  async function creditNote(saleBody: { id: string; lines: Array<{ id: string }> }, quantity: number, refundMethod: string) {
    const res = await post(`sales/${saleBody.id}/credit-notes`, {
      reason: 'Cliente devuelve producto',
      refundMethod,
      restock: true,
      items: [{ saleLineId: saleBody.lines[0].id, quantityCommercial: quantity }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: string; creditNoteNumber: string };
  }

  describe('nota crédito', () => {
    it('anular una devolución de contado: el lote vuelve a bajar, el dinero vuelve a caja y se reversa el asiento', async () => {
      const sold = await sale('EFECTIVO', 10);
      expect(await lotQuantity()).toBe(90);
      const beforeNote = await inventoryState();
      const note = await creditNote(sold, 4, 'EFECTIVO');
      expect(await lotQuantity()).toBe(94);
      const cashAfterRefund = await cashBalance();

      const res = await post(`credit-notes/${note.id}/cancel`, { reason: 'Devolución registrada por error' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ status: 'ANULADA', cancellationReason: 'Devolución registrada por error' });
      expect(await lotQuantity()).toBe(90);
      expect(Number(await cashBalance())).toBe(Number(cashAfterRefund) + 4000);
      // Mayor y submayor de inventario vuelven a lo que tenían antes de la devolución
      expect(await inventoryState()).toEqual(beforeNote);

      const original = await prisma.journalEntry.findUniqueOrThrow({
        where: { sourceType_sourceId: { sourceType: 'CREDIT_NOTE', sourceId: note.id } },
      });
      expect(await prisma.journalEntry.count({ where: { reversalOfId: original.id } })).toBe(1);
      const kardex = await prisma.inventoryMovement.findFirstOrThrow({
        where: { referenceDocumentType: 'CREDIT_NOTE_CANCEL', referenceDocumentId: note.creditNoteNumber },
      });
      expect(kardex).toMatchObject({ movementType: 'SALIDA_ANULACION_DEVOLUCION', quantityBaseUnits: 4 });
      expect(await journalIsBalanced()).toBe(true);
      const audit = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'sales:credit_note_cancelled' } });
      expect(audit.entityId).toBe(note.id);

      // Ya anulada: no se anula dos veces y las unidades vuelven a poder devolverse
      await post(`credit-notes/${note.id}/cancel`, { reason: 'Otra vez' }).expect(409);
      await creditNote(sold, 10, 'EFECTIVO');
    });

    it('anular una devolución a cartera: la factura vuelve a deberse y la venta se puede anular', async () => {
      const sold = await sale('CREDITO', 10);
      const receivable = await prisma.receivable.findUniqueOrThrow({ where: { saleId: sold.id } });
      const note = await creditNote(sold, 3, 'CREDITO_CARTERA');
      expect((await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } })).balance.toFixed(2)).toBe('7000.00');
      await post(`sales/${sold.id}/cancel`, { reason: 'Con nota vigente' }).expect(409);

      await post(`credit-notes/${note.id}/cancel`, { reason: 'Devolución equivocada' }).expect(200);
      const after = await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } });
      expect(after.totalAmount.toFixed(2)).toBe('10000.00');
      expect(after.balance.toFixed(2)).toBe('10000.00');
      expect(after.status).toBe('PENDIENTE');

      const movements = await request(app.getHttpServer())
        .get(`/api/v1/receivables/${receivable.id}/movements`)
        .set('Cookie', adminCookie)
        .expect(200);
      const types = movements.body.data.movements.map((m: { type: string }) => m.type);
      expect(types).toEqual(['CARGO', 'NOTA_CREDITO', 'ANULACION_NOTA_CREDITO']);
      expect(movements.body.data.movements.at(-1).balance).toBe('10000.00');

      // Sin notas vigentes, la venta ya se puede anular
      const cancelled = await post(`sales/${sold.id}/cancel`, { reason: 'Venta errada' });
      expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
      expect(await lotQuantity()).toBe(100);
      expect(await journalIsBalanced()).toBe(true);
    });

    it('no anula si entregó un cambio vigente o si la mercancía devuelta ya se vendió', async () => {
      const sold = await sale('EFECTIVO', 10);
      const exchanged = await creditNote(sold, 2, 'EFECTIVO');
      const exchange = await post('sales/confirm', {
        paymentMethod: 'EFECTIVO',
        amountPaid: 1000,
        customerId,
        exchangeCreditNoteId: exchanged.id,
        items: [{ productId, quantityCommercial: 1 }],
      });
      expect(exchange.status, JSON.stringify(exchange.body)).toBe(201);
      const blocked = await post(`credit-notes/${exchanged.id}/cancel`, { reason: 'Error' });
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toMatch(/anule primero esa venta/);

      // Lote: 100 - 10 + 2 - 1 = 91; la devolución de 5 lo deja en 96 y se venden 93
      const note = await creditNote(sold, 5, 'EFECTIVO');
      await sale('EFECTIVO', 93);
      const noStock = await post(`credit-notes/${note.id}/cancel`, { reason: 'Error' });
      expect(noStock.status).toBe(409);
      expect(noStock.body.message).toMatch(/ya no tiene las 5 unidades/);
      expect((await prisma.creditNote.findUniqueOrThrow({ where: { id: note.id } })).status).toBe('CONFIRMADA');
      expect(await lotQuantity()).toBe(3);
    });

    it('solo con permiso de anulación de ventas', async () => {
      const sold = await sale('EFECTIVO', 2);
      const note = await creditNote(sold, 1, 'EFECTIVO');
      await post(`credit-notes/${note.id}/cancel`, { reason: 'Sin permiso' }, roleCookies.cartera).expect(403);
      await post(`credit-notes/${note.id}/cancel`, { reason: 'x' }).expect(400);
    });
  });

  describe('recibo de caja y comprobante de egreso', () => {
    const base = (amount: string) =>
      post('treasury/cash-receipts', {
        kind: 'MANUAL',
        paymentMethod: 'EFECTIVO',
        concept: 'Base de caja',
        amount,
        counterpartAccountId: capitalAccountId,
      }).expect(201);

    it('anular un recibo de abono: reversa los abonos vigentes y saca de caja solo lo que seguía aplicado', async () => {
      const first = await sale('CREDITO', 10);
      const second = await sale('CREDITO', 5);
      const r1 = await prisma.receivable.findUniqueOrThrow({ where: { saleId: first.id } });
      const r2 = await prisma.receivable.findUniqueOrThrow({ where: { saleId: second.id } });
      const receipt = await post(
        'treasury/cash-receipts/collections',
        {
          kind: 'CARTERA',
          paymentMethod: 'EFECTIVO',
          concept: 'Abono Marta',
          customerId,
          applications: [
            { receivableId: r1.id, amount: '4000.00' },
            { receivableId: r2.id, amount: '5000.00' },
          ],
        },
        roleCookies.cartera,
      );
      expect(receipt.status, JSON.stringify(receipt.body)).toBe(201);
      // Uno de los abonos ya se había revertido por su cuenta
      const p2 = await prisma.receivablePayment.findFirstOrThrow({ where: { receivableId: r2.id } });
      // Cartera registra abonos pero no los reversa: sería anular parte del recibo
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${r2.id}/payments/${p2.id}/reverse`)
        .set('Cookie', roleCookies.cartera)
        .send({ reason: 'Abono duplicado' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${r2.id}/payments/${p2.id}/reverse`)
        .set('Cookie', adminCookie)
        .send({ reason: 'Abono duplicado' })
        .expect(200);
      const cashBefore = Number(await cashBalance());

      const manualRoute = await post(`treasury/cash-receipts/${receipt.body.id}/cancel`, { reason: 'Error' });
      expect(manualRoute.status).toBe(400);
      await post(`treasury/cash-receipts/collections/${receipt.body.id}/cancel`, { reason: 'Error' }, roleCookies.cajero).expect(403);
      // Cartera crea el recibo de abono pero anularlo exige recibo_caja.anular (admin o contable)
      await post(`treasury/cash-receipts/collections/${receipt.body.id}/cancel`, { reason: 'Error' }, roleCookies.cartera).expect(403);

      const res = await post(`treasury/cash-receipts/collections/${receipt.body.id}/cancel`, {
        reason: 'Recibo registrado al cliente equivocado',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ status: 'ANULADO', cancellationReason: 'Recibo registrado al cliente equivocado' });
      expect((await prisma.receivable.findUniqueOrThrow({ where: { id: r1.id } })).balance.toFixed(2)).toBe('10000.00');
      expect((await prisma.receivable.findUniqueOrThrow({ where: { id: r2.id } })).balance.toFixed(2)).toBe('5000.00');
      // Solo los 4.000 que seguían aplicados salen de caja, en un movimiento y sin otro recibo
      expect(Number(await cashBalance())).toBe(cashBefore - 4000);
      const contrary = await prisma.cashMovement.findMany({ where: { referenceDocumentType: 'TREASURY_DOCUMENT_CANCEL' } });
      expect(contrary).toHaveLength(1);
      expect(contrary[0].amount.toFixed(2)).toBe('4000.00');
      expect(await prisma.treasuryDocument.count({ where: { referenceDocumentType: 'TREASURY_DOCUMENT_CANCEL' } })).toBe(0);
      const p1 = await prisma.receivablePayment.findFirstOrThrow({ where: { receivableId: r1.id } });
      expect(p1.isReversed).toBe(true);
      expect(await journalIsBalanced()).toBe(true);

      await post(`treasury/cash-receipts/collections/${receipt.body.id}/cancel`, { reason: 'Otra vez' }).expect(409);
    });

    it('anular un comprobante a proveedor reversa factura de compra y causación y devuelve el dinero', async () => {
      await base('100000.00');
      const purchase = await prisma.purchase.create({
        data: { supplierId, invoiceNumber: 'FC-1', purchaseDate: new Date('2026-10-01'), totalAmount: new Prisma.Decimal('20000.00') },
      });
      const invoice = await prisma.payable.create({
        data: {
          purchaseId: purchase.id,
          supplierId,
          totalAmount: new Prisma.Decimal('20000.00'),
          balance: new Prisma.Decimal('20000.00'),
          dueDate: new Date('2026-10-31'),
        },
      });
      const account = await prisma.account.create({
        data: { code: '513525', name: 'ENERGIA', type: 'EXPENSE', level: 1, allowsMovement: true },
      });
      const expenseCategory = await prisma.expenseCategory.create({ data: { name: 'Servicios', accountId: account.id } });
      const expense = await prisma.expense.create({
        data: {
          categoryId: expenseCategory.id,
          description: 'Energía',
          beneficiary: 'Droguería Mayorista',
          supplierId,
          amount: new Prisma.Decimal('3000.00'),
          balance: new Prisma.Decimal('3000.00'),
          expenseDate: new Date('2026-10-05'),
          paymentMethod: 'CREDITO',
          status: 'PENDIENTE',
          createdById: adminId,
        },
      });
      const disbursement = await post('treasury/disbursements', {
        kind: 'PROVEEDOR',
        paymentMethod: 'EFECTIVO',
        concept: 'Pago proveedor',
        supplierId,
        applications: [
          { documentType: 'FACTURA_COMPRA', documentId: invoice.id, amount: '20000.00' },
          { documentType: 'CAUSACION_GASTO', documentId: expense.id, amount: '3000.00' },
        ],
      });
      expect(disbursement.status, JSON.stringify(disbursement.body)).toBe(201);
      const cashBefore = Number(await cashBalance());

      await post(`treasury/disbursements/${disbursement.body.id}/cancel`, { reason: 'Error' }, roleCookies.compras).expect(403);
      // Revertir un pago es anular parte del egreso: compras (payables:manage) y supervisor
      // (expenses:manage) no tienen comprobante_egreso.anular
      const payablePayment = await prisma.payablePayment.findFirstOrThrow({ where: { payableId: invoice.id } });
      const expensePayment = await prisma.expensePayment.findFirstOrThrow({ where: { expenseId: expense.id } });
      for (const cookie of [roleCookies.compras, roleCookies.supervisor]) {
        await request(app.getHttpServer())
          .post(`/api/v1/payables/${invoice.id}/payments/${payablePayment.id}/reverse`)
          .set('Cookie', cookie)
          .send({ reason: 'Pago equivocado' })
          .expect(403);
      }
      await request(app.getHttpServer())
        .post(`/api/v1/expenses/payments/${expensePayment.id}/reverse`)
        .set('Cookie', roleCookies.supervisor)
        .send({ reversalReason: 'Pago equivocado' })
        .expect(403);
      expect(await prisma.payablePayment.count({ where: { isReversed: true } })).toBe(0);
      expect(await prisma.expensePayment.count({ where: { isReversed: true } })).toBe(0);
      const res = await post(`treasury/disbursements/${disbursement.body.id}/cancel`, { reason: 'Pago al proveedor equivocado' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.status).toBe('ANULADO');
      expect((await prisma.payable.findUniqueOrThrow({ where: { id: invoice.id } })).balance.toFixed(2)).toBe('20000.00');
      const restored = await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } });
      expect(restored.balance.toFixed(2)).toBe('3000.00');
      expect(restored.status).toBe('PENDIENTE');
      expect(Number(await cashBalance())).toBe(cashBefore + 23000);
      expect(await prisma.journalEntry.count({ where: { sourceType: 'REVERSAL' } })).toBe(2);
      expect(await journalIsBalanced()).toBe(true);
    });

    it('anular un recibo manual reversa su asiento contra la contrapartida; uno automático se anula desde su origen', async () => {
      const receipt = await base('50000.00');
      const movement = await prisma.cashMovement.findFirstOrThrow({ where: { referenceDocumentId: receipt.body.id } });
      await post(`treasury/cash-receipts/collections/${receipt.body.id}/cancel`, { reason: 'Error' }).expect(400);
      await post(`treasury/cash-receipts/${receipt.body.id}/cancel`, { reason: 'Error' }, roleCookies.cartera).expect(403);

      const res = await post(`treasury/cash-receipts/${receipt.body.id}/cancel`, { reason: 'Aporte mal registrado' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const original = await prisma.journalEntry.findUniqueOrThrow({
        where: { sourceType_sourceId: { sourceType: 'CASH_MOVEMENT', sourceId: movement.id } },
      });
      expect(await prisma.journalEntry.count({ where: { reversalOfId: original.id } })).toBe(1);
      expect(await cashBalance()).toBe('0.00');
      expect(await journalIsBalanced()).toBe(true);

      // El reembolso de una devolución genera un comprobante automático: se anula la devolución
      const sold = await sale('EFECTIVO', 2);
      const note = await creditNote(sold, 1, 'EFECTIVO');
      const automatic = await prisma.treasuryDocument.findFirstOrThrow({
        where: { referenceDocumentType: 'CREDIT_NOTE', referenceDocumentId: note.creditNoteNumber },
      });
      const blocked = await post(`treasury/disbursements/${automatic.id}/cancel`, { reason: 'Error' });
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toMatch(/anúlelo desde el documento de origen/);
    });

    it('el documento anulado no se puede modificar ni borrar en la base', async () => {
      const receipt = await base('1000.00');
      await post(`treasury/cash-receipts/${receipt.body.id}/cancel`, { reason: 'Prueba de inmutabilidad' }).expect(200);
      await expect(
        prisma.treasuryDocument.update({ where: { id: receipt.body.id }, data: { concept: 'Cambiado' } }),
      ).rejects.toThrow(/inmutable/);
      await expect(prisma.treasuryDocument.delete({ where: { id: receipt.body.id } })).rejects.toThrow(/inmutable/);
    });
  });
});
