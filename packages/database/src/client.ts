import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function ensureEnvLoaded(): void {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
    } catch {
      try {
        process.loadEnvFile('../../.env');
      } catch {
        // Ignorar si no existe archivo .env; se leerá directamente de process.env
      }
    }
  }
}

/**
 * Extrae de forma segura el nombre de la base de datos de una URL de conexión
 * sin exponer credenciales ni host.
 */
export function extractDatabaseName(connectionUrl: string): string {
  try {
    const parsed = new URL(connectionUrl);
    return parsed.pathname.replace(/^\//, '').split('?')[0];
  } catch {
    return '';
  }
}

/**
 * Valida que una URL de base de datos corresponda estrictamente a un entorno de pruebas.
 * Evita que una suite de tests apunte o destruya datos de desarrollo o producción.
 */
export function validateTestDatabaseUrl(url: string): void {
  const dbName = extractDatabaseName(url);
  if (!dbName || (!dbName.endsWith('_test') && dbName !== 'farmacia_test')) {
    throw new Error(
      `[Seguridad] Operación de pruebas rechazada: la base de datos configurada "${dbName || 'desconocida'}" no es una base de datos de pruebas válida (debe llamarse 'farmacia_test' o terminar en '_test').`
    );
  }
}

export interface ResolveDatabaseUrlOptions {
  forceTest?: boolean;
  forceDev?: boolean;
}

/**
 * Resuelve la URL de la base de datos adecuada según el entorno:
 * - En testing (`NODE_ENV === 'test'` o `VITEST === 'true'`): requiere `DATABASE_TEST_URL` y valida que sea una DB de test.
 *   NO realiza fallback a `DATABASE_URL`.
 * - En otros entornos: utiliza `DATABASE_URL`.
 */
export function resolveDatabaseUrl(options?: ResolveDatabaseUrlOptions): string {
  ensureEnvLoaded();

  const isTest =
    options?.forceTest ||
    (!options?.forceDev && (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'));

  if (isTest) {
    const testUrl = process.env.DATABASE_TEST_URL;
    if (!testUrl) {
      throw new Error(
        'DATABASE_TEST_URL no está configurada. En entorno de testing es obligatorio definir DATABASE_TEST_URL (no se permite fallback a DATABASE_URL).'
      );
    }
    validateTestDatabaseUrl(testUrl);
    return testUrl;
  }

  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) {
    throw new Error(
      'DATABASE_URL no está configurada. Por favor defina la variable en el entorno o en un archivo .env basado en .env.example'
    );
  }
  return devUrl;
}

/**
 * Crea una instancia de PrismaClient conectada a la URL especificada o resuelta automáticamente.
 */
export function createPrismaClient(customUrl?: string): PrismaClient {
  const url = customUrl || resolveDatabaseUrl();
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

export const prisma = createPrismaClient();

export interface DatabaseCheckResult {
  ok: boolean;
  message: string;
  durationMs: number;
  databaseName?: string;
  result?: unknown;
}

function sanitizeErrorMessage(message: string): string {
  return message.replace(/postgresql:\/\/[^@]+@/g, 'postgresql://***:***@');
}

/**
 * Comprueba de forma segura la conectividad real con PostgreSQL sin modificar datos.
 * Ejecuta una consulta canónica `SELECT 1` y comprueba la base de datos actual.
 */
export async function checkDatabaseConnection(client: PrismaClient = prisma): Promise<DatabaseCheckResult> {
  const start = Date.now();
  try {
    const queryResult = await client.$queryRaw<Array<{ connection_status: number; current_db: string }>>`
      SELECT 1 as connection_status, current_database() as current_db
    `;
    const durationMs = Date.now() - start;
    const currentDb = queryResult[0]?.current_db;
    return {
      ok: true,
      message: `Conexión exitosa contra PostgreSQL 18 (base: ${currentDb})`,
      durationMs,
      databaseName: currentDb,
      result: queryResult,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    const rawMessage = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: sanitizeErrorMessage(rawMessage),
      durationMs,
    };
  }
}

/**
 * Limpia de forma controlada las tablas de la base de datos de pruebas entre ejecuciones de tests.
 * PROTECCIÓN DE SEGURIDAD ESTRICTA:
 * - Valida que la conexión activa apunte a una base con sufijo `_test` o `farmacia_test`.
 * - Rechaza terminantemente su ejecución si la base conectada es de desarrollo o producción.
 */
export async function cleanTestDatabase(client: PrismaClient = prisma): Promise<void> {
  const rows = await client.$queryRaw<Array<{ current_db: string }>>`
    SELECT current_database() as current_db
  `;
  const currentDb = rows[0]?.current_db || '';

  if (!currentDb || (!currentDb.endsWith('_test') && currentDb !== 'farmacia_test')) {
    throw new Error(
      `[Seguridad] Limpieza abortada: la base de datos actual "${currentDb}" no está autorizada para operaciones destructivas de test.`
    );
  }

  await client.$executeRaw`TRUNCATE TABLE "treasury_documents", "document_locks", "debit_note_lines", "debit_notes", "credit_note_lines", "credit_notes", "fiscal_periods", "expense_payments", "expenses", "expense_categories", "bank_movements", "bank_accounts", "product_tax_profiles", "journal_entry_lines", "journal_entries", "company_accounting_mappings", "accounts", "inventory_alerts", "background_jobs", "payable_payments", "payables", "receivable_payments", "receivables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "cash_movements", "customers", "purchase_lines", "purchases", "suppliers", "inventory_movements", "inventory_lots", "locations", "product_presentations", "products", "categories", "audit_events", "role_permissions", "user_roles", "permissions", "roles", "sessions", "users" CASCADE`;
  // Los consecutivos de recibos y egresos vuelven a empezar en cada prueba
  await client.$executeRaw`UPDATE "treasury_document_sequences" SET "last_value" = 0`;
}

