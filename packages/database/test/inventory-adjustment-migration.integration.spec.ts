import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Client } from 'pg';
import { Prisma } from '@prisma/client';
import { prisma, cleanTestDatabase } from '../src';

/**
 * FARM-AUD-004 / FARM-AUD-012: la migración separa el motivo de los ajustes y exige que el
 * producto del kardex sea el dueño del lote, sin tocar el historial inmutable. Cada caso recrea
 * el esquema previo dentro de una transacción que se revierte.
 */
const MIGRATION_FILE_SQL = readFileSync(
  resolve(
    __dirname,
    '../prisma/migrations/20261013120000_inventory_adjustment_integrity/migration.sql',
  ),
  'utf8',
);
// La prueba ya abre su propia transacción: se ejecuta el cuerpo sin su BEGIN/COMMIT
const MIGRATION_SQL = MIGRATION_FILE_SQL.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
const LOT_PRODUCT_FK = 'inventory_movements_lot_id_product_id_fkey';
const REASON_CHECK = 'inventory_movements_manual_adjustment_reason_check';

const PRE_MIGRATION_SCHEMA = `
  ALTER TABLE "inventory_movements" DROP CONSTRAINT "${LOT_PRODUCT_FK}";
  ALTER TABLE "inventory_movements" DROP CONSTRAINT "${REASON_CHECK}";
  ALTER TABLE "inventory_movements" DROP COLUMN "reason";
  DROP INDEX "inventory_lots_id_product_id_key";
  ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lot_id_fkey"
    FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
`;

function testDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_TEST_URL ?? '');
  url.search = '';
  return url.toString();
}

describe('Migración de integridad de ajustes de inventario (FARM-AUD-004 / FARM-AUD-012)', () => {
  let userId: string;
  let productAId: string;
  let productBId: string;
  let lotAId: string;

  beforeEach(async () => {
    await cleanTestDatabase();
    userId = (
      await prisma.user.create({
        data: { username: 'kardex_migracion', passwordHash: 'argon2id$mockedhash', isActive: true },
      })
    ).id;
    const category = await prisma.category.create({ data: { name: 'Medicamentos' } });
    const createProduct = (code: string) =>
      prisma.product.create({
        data: {
          categoryId: category.id,
          code,
          name: `Producto ${code}`,
          baseUnit: 'TABLETA',
          basePrice: new Prisma.Decimal('500.00'),
          baseCost: new Prisma.Decimal('200.00'),
          requiresLotControl: true,
        },
      });
    productAId = (await createProduct('PRD-A')).id;
    productBId = (await createProduct('PRD-B')).id;
    const location = await prisma.location.create({
      data: { code: 'MIG-01', name: 'Estante', isDefault: true },
    });
    lotAId = (
      await prisma.inventoryLot.create({
        data: {
          productId: productAId,
          locationId: location.id,
          lotNumber: 'LOT-A',
          expirationDate: new Date('2027-12-31'),
          currentQuantity: 40,
          isActive: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  /** Ejecuta `work` con el esquema previo a la migración y revierte todo al final. */
  async function withPreMigrationSchema(work: (client: Client) => Promise<void>): Promise<void> {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(PRE_MIGRATION_SCHEMA);
      await work(client);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  }

  const insertLegacyMovement = (client: Client, productId: string, notes: string) =>
    client.query(
      `INSERT INTO "inventory_movements" ("id", "movement_type", "product_id", "lot_id",
         "quantity_base_units", "balance_after_base_units", "reference_document_type",
         "reference_document_id", "notes", "created_by_user_id")
       VALUES (gen_random_uuid(), 'AJUSTE_NEGATIVO', $1, $2, -2, 38, 'AJUSTE_MANUAL',
         'MOTIVO: Unidades averiadas', $3, $4)`,
      [productId, lotAId, notes, userId],
    );

  const snapshot = async (client: Client) =>
    (
      await client.query(
        `SELECT "id", "movement_type", "product_id", "lot_id", "quantity_base_units",
                "balance_after_base_units", "reference_document_type", "reference_document_id",
                "notes", "created_by_user_id", "created_at"
         FROM "inventory_movements" ORDER BY "id"`,
      )
    ).rows;

  const constraintValidated = async (client: Client, name: string) =>
    (await client.query('SELECT convalidated FROM pg_constraint WHERE conname = $1', [name]))
      .rows[0]?.convalidated as boolean | undefined;

  it('conserva un historial inconsistente intacto y exige la correspondencia en movimientos nuevos', async () => {
    await withPreMigrationSchema(async (client) => {
      // Movimiento heredado del defecto: producto B registrado sobre el lote del producto A
      await insertLegacyMovement(client, productBId, 'Ajuste heredado con producto equivocado');
      await insertLegacyMovement(client, productAId, 'Ajuste heredado correcto');
      const before = await snapshot(client);

      await client.query(MIGRATION_SQL);

      expect(await snapshot(client)).toEqual(before);
      // Sin validar el historial: la regla rige para lo nuevo y el kardex no se reescribe
      expect(await constraintValidated(client, LOT_PRODUCT_FK)).toBe(false);

      await client.query('SAVEPOINT nuevo');
      await expect(
        client.query(
          `INSERT INTO "inventory_movements" ("id", "movement_type", "product_id", "lot_id",
             "quantity_base_units", "balance_after_base_units", "reference_document_type",
             "reference_document_id", "reason")
           VALUES (gen_random_uuid(), 'AJUSTE_POSITIVO', $1, $2, 1, 41, 'AJUSTE_MANUAL', NULL,
             'Sobrante')`,
          [productBId, lotAId],
        ),
      ).rejects.toThrow(new RegExp(LOT_PRODUCT_FK));
      await client.query('ROLLBACK TO SAVEPOINT nuevo');
    });
  });

  it('valida la restricción cuando el historial es consistente', async () => {
    await withPreMigrationSchema(async (client) => {
      await insertLegacyMovement(client, productAId, 'Ajuste heredado correcto');

      await client.query(MIGRATION_SQL);

      expect(await constraintValidated(client, LOT_PRODUCT_FK)).toBe(true);
    });
  });

  it('agrega el motivo como campo propio y lo exige en los ajustes manuales nuevos', async () => {
    await withPreMigrationSchema(async (client) => {
      await insertLegacyMovement(client, productAId, 'Ajuste heredado sin campo de motivo');

      await client.query(MIGRATION_SQL);

      const column = await client.query(
        `SELECT data_type, character_maximum_length, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'inventory_movements' AND column_name = 'reason'`,
      );
      expect(column.rows[0]).toEqual({
        data_type: 'character varying',
        character_maximum_length: 250,
        is_nullable: 'YES',
      });
      // El ajuste heredado conserva su motivo original en reference_document_id
      const legacy = await client.query(
        `SELECT "reason", "reference_document_id" FROM "inventory_movements"`,
      );
      expect(legacy.rows).toEqual([
        { reason: null, reference_document_id: 'MOTIVO: Unidades averiadas' },
      ]);
      expect(await constraintValidated(client, REASON_CHECK)).toBe(false);

      await client.query('SAVEPOINT sin_motivo');
      await expect(
        client.query(
          `INSERT INTO "inventory_movements" ("id", "movement_type", "product_id", "lot_id",
             "quantity_base_units", "balance_after_base_units", "reference_document_type")
           VALUES (gen_random_uuid(), 'AJUSTE_POSITIVO', $1, $2, 1, 41, 'AJUSTE_MANUAL')`,
          [productAId, lotAId],
        ),
      ).rejects.toThrow(new RegExp(REASON_CHECK));
      await client.query('ROLLBACK TO SAVEPOINT sin_motivo');
    });
  });

  it('se ejecuta en una transacción explícita, con tiempo límite de espera y las tablas bloqueadas', () => {
    const statements = MIGRATION_FILE_SQL.split('\n').filter(
      (l) => l.trim() && !l.startsWith('--'),
    );
    expect(statements[0]).toBe('BEGIN;');
    expect(statements[1]).toBe("SET LOCAL lock_timeout = '10s';");
    expect(statements[2]).toBe('LOCK TABLE "inventory_lots" IN SHARE ROW EXCLUSIVE MODE;');
    expect(statements[3]).toBe('LOCK TABLE "inventory_movements" IN ACCESS EXCLUSIVE MODE;');
    expect(statements.at(-1)).toBe('COMMIT;');
    expect(MIGRATION_SQL).not.toMatch(/^(BEGIN|COMMIT);$/m);
  });
});
