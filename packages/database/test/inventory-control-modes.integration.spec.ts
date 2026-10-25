import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { Prisma } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanTestDatabase, prisma } from '../src';

type InventoryControlMode = 'SERVICE' | 'SIMPLE' | 'LOT' | 'LOT_EXPIRY' | 'SERIAL';

type LotInput = {
  lotNumber: string | null;
  expirationDate: string | null;
  currentQuantity?: number;
};

const MIGRATION_FILE_SQL = readFileSync(
  resolve(__dirname, '../prisma/migrations/20261026090000_inventory_control_modes/migration.sql'),
  'utf8',
);
const MIGRATION_SQL = MIGRATION_FILE_SQL.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');

const PRE_F4_SCHEMA = `
  DROP TRIGGER IF EXISTS products_inventory_control_mode_locked_trg ON "products";
  DROP TRIGGER IF EXISTS inventory_lots_identity_immutable_trg ON "inventory_lots";
  DROP TRIGGER IF EXISTS inventory_lots_control_mode_insert_trg ON "inventory_lots";
  DROP FUNCTION IF EXISTS guard_product_inventory_control_mode_update();
  DROP FUNCTION IF EXISTS guard_inventory_lot_identity_update();
  DROP FUNCTION IF EXISTS guard_inventory_lot_insert_control_mode();
  DROP INDEX IF EXISTS "inventory_lots_simple_product_location_key";
  DROP INDEX IF EXISTS "inventory_lots_serial_product_number_key";
  ALTER TABLE "products" DROP CONSTRAINT "products_inventory_control_mode_check";
  ALTER TABLE "products" DROP COLUMN "inventory_control_mode";
  ALTER TABLE "products" ADD COLUMN "requires_lot_control" BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE "inventory_lots"
    DROP CONSTRAINT "inventory_lots_control_mode_check",
    DROP CONSTRAINT "inventory_lots_control_mode_shape_check",
    DROP CONSTRAINT "inventory_lots_lot_number_nonempty_check";
  ALTER TABLE "inventory_lots" DROP COLUMN "control_mode";
  ALTER TABLE "inventory_lots"
    ALTER COLUMN "lot_number" SET NOT NULL,
    ALTER COLUMN "expiration_date" SET NOT NULL;
  ALTER TABLE "purchase_lines" DROP CONSTRAINT "purchase_lines_lot_number_nonempty_check";
  ALTER TABLE "purchase_lines"
    ALTER COLUMN "lot_number" SET NOT NULL,
    ALTER COLUMN "expiration_date" SET NOT NULL;
`;

function testDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_TEST_URL ?? '');
  url.search = '';
  return url.toString();
}

async function withPg<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function expectPostgresError(
  operation: Promise<unknown>,
  expectedMessage: RegExp,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect((error as Error).message).toMatch(expectedMessage);
    return;
  }

  throw new Error(`Se esperaba un error de PostgreSQL que coincidiera con ${expectedMessage}`);
}

async function insertLot(
  client: Client,
  productId: string,
  locationId: string,
  controlMode: InventoryControlMode,
  input: LotInput,
): Promise<void> {
  await client.query(
    `INSERT INTO "inventory_lots" (
       "id", "product_id", "location_id", "lot_number", "expiration_date",
       "control_mode", "current_quantity", "updated_at"
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP
     )`,
    [
      productId,
      locationId,
      input.lotNumber,
      input.expirationDate,
      controlMode,
      input.currentQuantity ?? 1,
    ],
  );
}

describe('Modos de control de inventario F4 en PostgreSQL', () => {
  let categoryId: string;
  let locationId: string;
  let productCounter: number;

  beforeEach(async () => {
    await cleanTestDatabase();
    productCounter = 0;
    categoryId = (await prisma.category.create({ data: { name: 'Categoría modos inventario' } }))
      .id;
    locationId = (
      await prisma.location.create({ data: { code: 'MODOS-01', name: 'Bodega de prueba' } })
    ).id;
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  });

  async function createProduct(
    inventoryControlMode: InventoryControlMode,
    code = `MODO-${++productCounter}`,
  ): Promise<string> {
    const product = await prisma.product.create({
      data: {
        categoryId,
        code,
        name: `Producto ${code}`,
        inventoryControlMode,
        basePrice: new Prisma.Decimal('100.00'),
      },
    });
    return product.id;
  }

  it.each([
    { mode: 'SIMPLE' as const, input: { lotNumber: null, expirationDate: null } },
    { mode: 'LOT' as const, input: { lotNumber: 'LOTE-VALIDO', expirationDate: null } },
    {
      mode: 'LOT_EXPIRY' as const,
      input: { lotNumber: 'LOTE-VENCE', expirationDate: '2030-12-31' },
    },
    { mode: 'SERIAL' as const, input: { lotNumber: 'SERIE-VALIDA', expirationDate: null } },
  ])('acepta la forma válida del modo $mode', async ({ mode, input }) => {
    const productId = await createProduct(mode);
    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId,
        controlMode: mode,
        lotNumber: input.lotNumber,
        expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
        currentQuantity: 1,
      },
    });

    expect(lot.controlMode).toBe(mode);
  });

  it.each([
    {
      mode: 'SIMPLE' as const,
      input: { lotNumber: 'LOTE-PROHIBIDO', expirationDate: null },
    },
    { mode: 'LOT' as const, input: { lotNumber: null, expirationDate: null } },
    {
      mode: 'LOT_EXPIRY' as const,
      input: { lotNumber: 'LOTE-SIN-FECHA', expirationDate: null },
    },
    {
      mode: 'SERIAL' as const,
      input: { lotNumber: null, expirationDate: null },
    },
  ])('rechaza mediante CHECK la forma inválida del modo $mode', async ({ mode, input }) => {
    const productId = await createProduct(mode);
    await withPg((client) =>
      expectPostgresError(
        insertLot(client, productId, locationId, mode, input),
        /inventory_lots_control_mode_shape_check/,
      ),
    );
  });

  it('rechaza SERVICE en inventory_lots mediante el CHECK del modo permitido', async () => {
    const productId = await createProduct('SERVICE');

    await withPg(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(
          'ALTER TABLE "inventory_lots" DISABLE TRIGGER inventory_lots_control_mode_insert_trg',
        );
        await client.query('SAVEPOINT servicio_no_fisico');
        await expectPostgresError(
          insertLot(client, productId, locationId, 'SERVICE', {
            lotNumber: null,
            expirationDate: null,
          }),
          /inventory_lots_control_mode_check/,
        );
        await client.query('ROLLBACK TO SAVEPOINT servicio_no_fisico');
        await client.query(
          'ALTER TABLE "inventory_lots" ENABLE TRIGGER inventory_lots_control_mode_insert_trg',
        );
        await client.query('COMMIT');
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
      }
    });
  });

  it('permite un solo saldo SIMPLE por producto y ubicación', async () => {
    const productId = await createProduct('SIMPLE');

    await withPg(async (client) => {
      await insertLot(client, productId, locationId, 'SIMPLE', {
        lotNumber: null,
        expirationDate: null,
      });
      await expectPostgresError(
        insertLot(client, productId, locationId, 'SIMPLE', {
          lotNumber: null,
          expirationDate: null,
        }),
        /inventory_lots_simple_product_location_key/,
      );
    });
  });

  it('impide repetir una serie del producto en otra ubicación', async () => {
    const productId = await createProduct('SERIAL');
    const otherLocationId = (
      await prisma.location.create({ data: { code: 'MODOS-02', name: 'Otra bodega' } })
    ).id;

    await withPg(async (client) => {
      await insertLot(client, productId, locationId, 'SERIAL', {
        lotNumber: 'SERIE-001',
        expirationDate: null,
      });
      await expectPostgresError(
        insertLot(client, productId, otherLocationId, 'SERIAL', {
          lotNumber: 'SERIE-001',
          expirationDate: null,
        }),
        /inventory_lots_serial_product_number_key/,
      );
    });
  });

  it('rechaza una serie con más de una unidad', async () => {
    const productId = await createProduct('SERIAL');

    await withPg((client) =>
      expectPostgresError(
        insertLot(client, productId, locationId, 'SERIAL', {
          lotNumber: 'SERIE-002',
          expirationDate: null,
          currentQuantity: 2,
        }),
        /inventory_lots_control_mode_shape_check/,
      ),
    );
  });

  it('rechaza una existencia si el modo difiere del producto o si el producto es SERVICE', async () => {
    const simpleProductId = await createProduct('SIMPLE');
    const serviceProductId = await createProduct('SERVICE');

    await withPg(async (client) => {
      await expectPostgresError(
        insertLot(client, simpleProductId, locationId, 'LOT', {
          lotNumber: 'LOTE-MODO-DISTINTO',
          expirationDate: null,
        }),
        /^INVENTORY_CONTROL_MODE_MISMATCH:/,
      );
      await expectPostgresError(
        insertLot(client, serviceProductId, locationId, 'SIMPLE', {
          lotNumber: null,
          expirationDate: null,
        }),
        /^INVENTORY_CONTROL_MODE_MISMATCH:/,
      );
    });
  });

  it('bloquea el cambio de modo con existencias y lo permite sin existencias', async () => {
    const productWithStockId = await createProduct('LOT_EXPIRY');
    const productWithoutStockId = await createProduct('LOT_EXPIRY');

    await prisma.inventoryLot.create({
      data: {
        productId: productWithStockId,
        locationId,
        controlMode: 'LOT_EXPIRY',
        lotNumber: 'LOTE-HISTORICO',
        expirationDate: new Date('2030-12-31'),
        currentQuantity: 0,
      },
    });

    await withPg(async (client) => {
      await expectPostgresError(
        client.query('UPDATE "products" SET "inventory_control_mode" = $1 WHERE "id" = $2', [
          'SIMPLE',
          productWithStockId,
        ]),
        /^INVENTORY_CONTROL_MODE_LOCKED:/,
      );
    });

    const updated = await prisma.product.update({
      where: { id: productWithoutStockId },
      data: { inventoryControlMode: 'SIMPLE' },
    });
    expect(updated.inventoryControlMode).toBe('SIMPLE');
  });

  it('hace inmutables control_mode y product_id de una existencia', async () => {
    const productId = await createProduct('LOT_EXPIRY');
    const otherProductId = await createProduct('LOT_EXPIRY');
    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId,
        controlMode: 'LOT_EXPIRY',
        lotNumber: 'LOTE-INMUTABLE',
        expirationDate: new Date('2030-12-31'),
      },
    });

    await withPg(async (client) => {
      await expectPostgresError(
        client.query('UPDATE "inventory_lots" SET "control_mode" = $1 WHERE "id" = $2', [
          'LOT',
          lot.id,
        ]),
        /^INVENTORY_LOT_IDENTITY_IMMUTABLE:/,
      );
      await expectPostgresError(
        client.query('UPDATE "inventory_lots" SET "product_id" = $1 WHERE "id" = $2', [
          otherProductId,
          lot.id,
        ]),
        /^INVENTORY_LOT_IDENTITY_IMMUTABLE:/,
      );
    });
  });

  it('migra los tres casos de backfill desde requires_lot_control', async () => {
    await withPg(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(PRE_F4_SCHEMA);

        const categoryIdForMigration = '10000000-0000-4000-8000-000000000001';
        const locationIdForMigration = '10000000-0000-4000-8000-000000000002';
        await client.query(
          'INSERT INTO "categories" ("id", "name", "updated_at") VALUES ($1, $2, CURRENT_TIMESTAMP)',
          [categoryIdForMigration, 'Categoría backfill F4'],
        );
        await client.query(
          'INSERT INTO "locations" ("id", "code", "name", "updated_at") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
          [locationIdForMigration, 'BACKFILL-01', 'Ubicación backfill F4'],
        );

        const legacyProducts = [
          { id: '10000000-0000-4000-8000-000000000011', code: 'LEGACY-TRUE', requiresLot: true },
          {
            id: '10000000-0000-4000-8000-000000000012',
            code: 'LEGACY-FALSE-EMPTY',
            requiresLot: false,
          },
          {
            id: '10000000-0000-4000-8000-000000000013',
            code: 'LEGACY-FALSE-LOTS',
            requiresLot: false,
          },
        ];
        for (const product of legacyProducts) {
          await client.query(
            `INSERT INTO "products" (
               "id", "category_id", "code", "name", "base_price", "requires_lot_control",
               "updated_at"
             ) VALUES ($1, $2, $3, $4, 100.00, $5, CURRENT_TIMESTAMP)`,
            [product.id, categoryIdForMigration, product.code, product.code, product.requiresLot],
          );
        }

        for (const [index, productId] of [legacyProducts[0].id, legacyProducts[2].id].entries()) {
          await client.query(
            `INSERT INTO "inventory_lots" (
               "id", "product_id", "location_id", "lot_number", "expiration_date",
               "current_quantity", "updated_at"
             ) VALUES ($1, $2, $3, $4, $5, 5, CURRENT_TIMESTAMP)`,
            [
              `10000000-0000-4000-8000-00000000002${index + 1}`,
              productId,
              locationIdForMigration,
              `LOTE-LEGACY-${index + 1}`,
              '2030-12-31',
            ],
          );
        }

        await client.query(MIGRATION_SQL);

        const productModes = await client.query(
          'SELECT "code", "inventory_control_mode" FROM "products" ORDER BY "code"',
        );
        expect(productModes.rows).toEqual([
          { code: 'LEGACY-FALSE-EMPTY', inventory_control_mode: 'SIMPLE' },
          { code: 'LEGACY-FALSE-LOTS', inventory_control_mode: 'LOT_EXPIRY' },
          { code: 'LEGACY-TRUE', inventory_control_mode: 'LOT_EXPIRY' },
        ]);

        const lotModes = await client.query(
          'SELECT "control_mode" FROM "inventory_lots" ORDER BY "lot_number"',
        );
        expect(lotModes.rows).toEqual([
          { control_mode: 'LOT_EXPIRY' },
          { control_mode: 'LOT_EXPIRY' },
        ]);
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
      }
    });
  });
});
