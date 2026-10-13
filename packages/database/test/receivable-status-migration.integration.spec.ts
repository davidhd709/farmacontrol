import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Client } from 'pg';
import { Prisma } from '@prisma/client';
import { prisma, cleanTestDatabase } from '../src';

/**
 * FARM-AUD-003: la anulación de ventas a crédito guardaba 'CANCELADA', un estado que el contrato
 * no reconoce. La migración regulariza esos registros a 'ANULADA' y prohíbe estados fuera del
 * contrato. Cada caso recrea el estado previo a la migración (sin la restricción y con datos
 * heredados) dentro de una transacción que se revierte, para no alterar el esquema de la base.
 */
const MIGRATION_FILE_SQL = readFileSync(
  resolve(__dirname, '../prisma/migrations/20261012120000_unify_receivable_status/migration.sql'),
  'utf8',
);
// Las pruebas ya abren su propia transacción (que revierten): se ejecuta el cuerpo de la
// migración sin su BEGIN/COMMIT, cuya presencia se verifica aparte.
const MIGRATION_SQL = MIGRATION_FILE_SQL.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
const CONSTRAINT = 'chk_receivables_status_allowed';

function testDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_TEST_URL ?? '');
  url.search = '';
  return url.toString();
}

describe('Migración de estados de cuentas por cobrar (FARM-AUD-003)', () => {
  let userId: string;
  let customerId: string;
  let invoice = 0;

  async function createCreditSale(
    status: 'COMPLETED' | 'CANCELLED',
    receivable: {
      status: string;
      total: string;
      paid: string;
    },
  ) {
    invoice += 1;
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: `FAC-MIG-${String(invoice).padStart(4, '0')}`,
        customerId,
        status,
        paymentMethod: 'CREDITO',
        subtotal: new Prisma.Decimal(receivable.total),
        taxTotal: new Prisma.Decimal('0.00'),
        discountTotal: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal(receivable.total),
        amountPaid: new Prisma.Decimal('0.00'),
        changeGiven: new Prisma.Decimal('0.00'),
        createdById: userId,
      },
    });
    const balance = new Prisma.Decimal(receivable.total).minus(receivable.paid);
    // Se crea con un estado permitido; el estado heredado se impone dentro de cada transacción
    const row = await prisma.receivable.create({
      data: {
        saleId: sale.id,
        customerId,
        totalAmount: new Prisma.Decimal(receivable.total),
        amountPaid: new Prisma.Decimal(receivable.paid),
        balance,
        status: receivable.status === 'CANCELADA' ? 'ANULADA' : receivable.status,
        dueDate: new Date('2026-11-30'),
        notes: `Venta a crédito ${sale.invoiceNumber}`,
      },
    });
    return { saleId: sale.id, receivableId: row.id };
  }

  /** Ejecuta `work` con la base en el estado previo a la migración y revierte todo al final. */
  async function withPreMigrationState(
    legacyStatuses: Record<string, string>,
    work: (client: Client) => Promise<void>,
  ): Promise<void> {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(`ALTER TABLE "receivables" DROP CONSTRAINT "${CONSTRAINT}"`);
      for (const [id, status] of Object.entries(legacyStatuses)) {
        await client.query('UPDATE "receivables" SET "status" = $1 WHERE "id" = $2', [status, id]);
      }
      await work(client);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  }

  async function snapshot(client: Client) {
    const receivables = await client.query(
      `SELECT "id", "sale_id", "customer_id", "total_amount"::text, "amount_paid"::text,
              "balance"::text, "status", "due_date"::text, "notes", "updated_at"
       FROM "receivables" ORDER BY "id"`,
    );
    const payments = await client.query(
      `SELECT "id", "receivable_id", "amount"::text, "payment_method", "is_reversed",
              "reversal_reason", "created_at"
       FROM "receivable_payments" ORDER BY "id"`,
    );
    return { receivables: receivables.rows, payments: payments.rows };
  }

  beforeEach(async () => {
    await cleanTestDatabase();
    const user = await prisma.user.create({
      data: { username: 'cartera_migracion', passwordHash: 'argon2id$mockedhash', isActive: true },
    });
    userId = user.id;
    const customer = await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '1010101010',
        name: 'Cliente Crédito Histórico',
        isDefault: false,
        isActive: true,
      },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  it('Caso 5: regulariza CANCELADA a ANULADA sin tocar montos, relaciones, pagos ni otros estados', async () => {
    const cancelled = await createCreditSale('CANCELLED', {
      status: 'CANCELADA',
      total: '50000.00',
      paid: '0.00',
    });
    const pending = await createCreditSale('COMPLETED', {
      status: 'PENDIENTE',
      total: '30000.00',
      paid: '10000.00',
    });
    const paid = await createCreditSale('COMPLETED', {
      status: 'PAGADA',
      total: '20000.00',
      paid: '20000.00',
    });
    // Abono revertido antes de anular la venta: historial que debe conservarse
    await prisma.receivablePayment.create({
      data: {
        receivableId: cancelled.receivableId,
        amount: new Prisma.Decimal('5000.00'),
        paymentMethod: 'EFECTIVO',
        createdByUserId: userId,
        isReversed: true,
        reversedAt: new Date(),
        reversalReason: 'Abono registrado por error',
        reversedByUserId: userId,
      },
    });
    await prisma.receivablePayment.create({
      data: {
        receivableId: pending.receivableId,
        amount: new Prisma.Decimal('10000.00'),
        paymentMethod: 'EFECTIVO',
        createdByUserId: userId,
      },
    });

    await withPreMigrationState({ [cancelled.receivableId]: 'CANCELADA' }, async (client) => {
      const before = await snapshot(client);
      expect(before.receivables.find((r) => r.id === cancelled.receivableId)?.status).toBe(
        'CANCELADA',
      );

      await client.query(MIGRATION_SQL);

      const after = await snapshot(client);
      const expected = before.receivables.map((r) =>
        r.id === cancelled.receivableId ? { ...r, status: 'ANULADA' } : r,
      );
      expect(after.receivables).toEqual(expected);
      expect(after.payments).toEqual(before.payments);

      const statuses = Object.fromEntries(after.receivables.map((r) => [r.id, r.status]));
      expect(statuses[pending.receivableId]).toBe('PENDIENTE');
      expect(statuses[paid.receivableId]).toBe('PAGADA');

      const sales = await client.query(
        `SELECT "status", "total"::text FROM "sales" WHERE "id" = $1`,
        [cancelled.saleId],
      );
      expect(sales.rows[0]).toEqual({ status: 'CANCELLED', total: '50000.00' });

      // La restricción queda activa: un estado fuera del contrato ya no puede escribirse
      await client.query('SAVEPOINT intento');
      await expect(
        client.query('UPDATE "receivables" SET "status" = $1 WHERE "id" = $2', [
          'CANCELADA',
          pending.receivableId,
        ]),
      ).rejects.toThrow(new RegExp(CONSTRAINT));
      await client.query('ROLLBACK TO SAVEPOINT intento');
    });
  });

  it('se detiene sin modificar datos ante un estado no reconocido', async () => {
    const pending = await createCreditSale('COMPLETED', {
      status: 'PENDIENTE',
      total: '30000.00',
      paid: '0.00',
    });
    const cancelled = await createCreditSale('CANCELLED', {
      status: 'CANCELADA',
      total: '10000.00',
      paid: '0.00',
    });

    await withPreMigrationState(
      { [pending.receivableId]: 'EN_MORA', [cancelled.receivableId]: 'CANCELADA' },
      async (client) => {
        const before = await snapshot(client);
        await client.query('SAVEPOINT migracion');
        await expect(client.query(MIGRATION_SQL)).rejects.toThrow(/estado no reconocido/);
        await client.query('ROLLBACK TO SAVEPOINT migracion');
        expect(await snapshot(client)).toEqual(before);
      },
    );
  });

  it('se detiene si una cuenta CANCELADA pertenece a una venta que no está anulada', async () => {
    const orphan = await createCreditSale('COMPLETED', {
      status: 'CANCELADA',
      total: '15000.00',
      paid: '0.00',
    });

    await withPreMigrationState({ [orphan.receivableId]: 'CANCELADA' }, async (client) => {
      const before = await snapshot(client);
      await client.query('SAVEPOINT migracion');
      await expect(client.query(MIGRATION_SQL)).rejects.toThrow(/venta no anulada/);
      await client.query('ROLLBACK TO SAVEPOINT migracion');
      expect(await snapshot(client)).toEqual(before);
    });
  });

  it('se ejecuta en una transacción explícita con la tabla bloqueada', () => {
    const statements = MIGRATION_FILE_SQL.split('\n').filter(
      (l) => l.trim() && !l.startsWith('--'),
    );
    expect(statements[0]).toBe('BEGIN;');
    expect(statements[1]).toBe('LOCK TABLE "receivables" IN ACCESS EXCLUSIVE MODE;');
    expect(statements.at(-1)).toBe('COMMIT;');
    expect(MIGRATION_SQL).not.toMatch(/^(BEGIN|COMMIT);$/m);
  });

  it('con la migración aplicada la base rechaza estados fuera del contrato', async () => {
    const pending = await createCreditSale('COMPLETED', {
      status: 'PENDIENTE',
      total: '30000.00',
      paid: '0.00',
    });

    await expect(
      prisma.receivable.update({
        where: { id: pending.receivableId },
        data: { status: 'CANCELADA' },
      }),
    ).rejects.toThrow(new RegExp(CONSTRAINT));

    const row = await prisma.receivable.findUniqueOrThrow({ where: { id: pending.receivableId } });
    expect(row.status).toBe('PENDIENTE');
  });
});
