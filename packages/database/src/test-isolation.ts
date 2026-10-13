import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

/**
 * Aislamiento de pruebas (FARM-AUD-014).
 *
 * `infra/scripts/test-with-ephemeral-db.sh` crea un PostgreSQL temporal, marca su base con
 * `COMMENT ON DATABASE ... IS 'farmacontrol-test-run:<id>'` desde dentro de su propio
 * contenedor y exporta `FARMACIA_TEST_RUN_ID=<id>`. Antes de migrar, limpiar o ejecutar
 * pruebas de integración se exige que la base alcanzada por la URL efectiva lleve esa marca:
 * el nombre `*_test` no basta, porque una base de desarrollo puede llamarse igual.
 */
export const TEST_RUN_ID_ENV = 'FARMACIA_TEST_RUN_ID';
export const TEST_RUN_DIR_ENV = 'FARMACIA_TEST_RUN_DIR';
export const TEST_RUN_MARKER_PREFIX = 'farmacontrol-test-run:';
/** Archivo con el identificador de la ejecución dentro de su directorio temporal. */
export const TEST_RUN_STAMP_FILE = '.farmacontrol-test-run';

const RUN_ID_PATTERN = /^\d{14}-[0-9a-f]{12}$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
/**
 * Únicas variables de libpq admitidas. Cualquier otra (PGHOSTADDR, PGSERVICE, PGSERVICEFILE,
 * PGPASSFILE, PGOPTIONS, PGSSLMODE, PGCLUSTER...) puede desviar pg_dump o node-postgres.
 */
const ALLOWED_LIBPQ_VARIABLES = new Set(['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']);

export class TestIsolationError extends Error {
  constructor(message: string) {
    super(
      `[Aislamiento de pruebas] ${message} Ejecute las pruebas con "pnpm test", que crea una base PostgreSQL temporal.`,
    );
    this.name = 'TestIsolationError';
  }
}

export interface TestDatabaseTarget {
  runId: string;
  host: string;
  port: string;
  database: string;
  user: string;
}

export function testRunMarker(runId: string): string {
  return `${TEST_RUN_MARKER_PREFIX}${runId}`;
}

/**
 * Busca hacia arriba el directorio que contiene pnpm-workspace.yaml. Por defecto parte de la
 * ubicación de este módulo (src/ o dist/ del paquete), no del directorio de trabajo: un proceso
 * lanzado desde fuera del repositorio no puede eludir la comprobación "fuera del repositorio".
 */
export function findRepositoryRoot(start: string = __dirname): string | null {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function parseConnectionUrl(name: string, value: string | undefined): URL {
  if (!value) {
    throw new TestIsolationError(`${name} no está definida.`);
  }
  let url: URL;
  try {
    url = new URL(value);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      throw new Error('protocolo no soportado');
    }
  } catch {
    throw new TestIsolationError(`${name} no es una URL de PostgreSQL válida.`);
  }
  // node-postgres acepta ?host=, ?port=, ?user=, ?password=... que reemplazan a los de la URL:
  // solo se admite `schema` (Prisma), para que lo validado sea lo que realmente se conecta
  const overrides = [...url.searchParams.keys()].filter((key) => key !== 'schema');
  if (overrides.length > 0) {
    throw new TestIsolationError(
      `${name} no puede llevar parámetros de conexión en la consulta: ${[...new Set(overrides)].sort().join(', ')}.`,
    );
  }
  return url;
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function realPathOrResolved(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

/**
 * Exige una ruta existente y ya canónica: sin `.`/`..` ni enlaces simbólicos en ningún
 * componente (realpath debe devolver exactamente la misma ruta).
 */
function requireCanonicalPath(label: string, target: string): string {
  let canonical: string;
  try {
    if (fs.lstatSync(target).isSymbolicLink()) {
      throw new TestIsolationError(`${label} no puede ser un enlace simbólico.`);
    }
    canonical = fs.realpathSync(target);
  } catch (error) {
    if (error instanceof TestIsolationError) throw error;
    throw new TestIsolationError(`${label} no existe o no se puede verificar.`);
  }
  if (canonical !== target) {
    throw new TestIsolationError(
      `${label} debe ser una ruta canónica (sin "..", "." ni enlaces simbólicos intermedios).`,
    );
  }
  return canonical;
}

/**
 * El directorio temporal de la ejecución lo crea el script de pruebas: debe llevar el
 * identificador en su nombre y en su sello, pertenecer al usuario actual, no admitir escritura
 * de otros usuarios y estar fuera del repositorio. BACKUP_DIR debe ser exactamente su
 * subdirectorio `backups` (rutas canónicas: sin `../` ni enlaces que salgan de él), para que la
 * retención de backup.sh nunca recorra un directorio de respaldos reales.
 */
function checkRunDirectory(
  env: NodeJS.ProcessEnv,
  runId: string,
  repositoryRoot: string | null,
): void {
  const rawRunDir = env[TEST_RUN_DIR_ENV];
  if (!rawRunDir || !path.isAbsolute(rawRunDir)) {
    throw new TestIsolationError(`${TEST_RUN_DIR_ENV} debe ser una ruta absoluta.`);
  }
  const runDir = requireCanonicalPath(TEST_RUN_DIR_ENV, rawRunDir);
  const runDirStat = fs.statSync(runDir);
  if (!runDirStat.isDirectory()) {
    throw new TestIsolationError(`${TEST_RUN_DIR_ENV} no es un directorio.`);
  }
  if (!path.basename(runDir).startsWith(`farmacontrol-test-${runId}.`)) {
    throw new TestIsolationError(`${TEST_RUN_DIR_ENV} no corresponde a esta ejecución.`);
  }
  if (typeof process.getuid === 'function' && runDirStat.uid !== process.getuid()) {
    throw new TestIsolationError(`${TEST_RUN_DIR_ENV} no pertenece al usuario que ejecuta las pruebas.`);
  }
  if ((runDirStat.mode & 0o022) !== 0) {
    throw new TestIsolationError(`${TEST_RUN_DIR_ENV} admite escritura de otros usuarios.`);
  }
  if (!repositoryRoot) {
    throw new TestIsolationError('no se pudo determinar la raíz del repositorio para validar los directorios.');
  }
  if (isInside(runDir, realPathOrResolved(repositoryRoot))) {
    throw new TestIsolationError(`${TEST_RUN_DIR_ENV} no puede estar dentro del repositorio.`);
  }

  const stampPath = path.join(runDir, TEST_RUN_STAMP_FILE);
  let stamp: string;
  try {
    const stampStat = fs.lstatSync(stampPath);
    if (!stampStat.isFile()) throw new Error('no es un archivo regular');
    stamp = fs.readFileSync(stampPath, 'utf8').trim();
  } catch {
    throw new TestIsolationError(`${TEST_RUN_DIR_ENV} no tiene la marca de la ejecución.`);
  }
  if (stamp !== runId) {
    throw new TestIsolationError(`la marca de ${TEST_RUN_DIR_ENV} no corresponde a esta ejecución.`);
  }

  const rawBackupDir = env.BACKUP_DIR;
  if (!rawBackupDir || !path.isAbsolute(rawBackupDir)) {
    throw new TestIsolationError('BACKUP_DIR debe ser una ruta absoluta.');
  }
  const backupDir = requireCanonicalPath('BACKUP_DIR', rawBackupDir);
  if (backupDir !== path.join(runDir, 'backups') || !fs.statSync(backupDir).isDirectory()) {
    throw new TestIsolationError(
      'BACKUP_DIR debe ser el directorio de respaldos de esta ejecución: la retención de backup.sh borraría respaldos reales.',
    );
  }
}

/**
 * Comprobaciones que no necesitan red: la ejecución está autorizada, todas las variables de
 * conexión (Prisma y libpq) apuntan al mismo destino local y los respaldos de prueba quedan
 * fuera del repositorio y sin destino externo.
 */
export function checkTestEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  repositoryRoot: string | null = findRepositoryRoot(),
): TestDatabaseTarget {
  const runId = env[TEST_RUN_ID_ENV];
  if (!runId || !RUN_ID_PATTERN.test(runId)) {
    throw new TestIsolationError(
      `${TEST_RUN_ID_ENV} no está definida o no tiene el formato de una ejecución autorizada.`,
    );
  }
  if (env.NODE_ENV !== 'test') {
    throw new TestIsolationError('NODE_ENV debe ser "test".');
  }

  const testUrl = parseConnectionUrl('DATABASE_TEST_URL', env.DATABASE_TEST_URL);
  parseConnectionUrl('DATABASE_URL', env.DATABASE_URL);
  // Prisma usa una u otra según NODE_ENV; ambas deben llevar a la misma base temporal
  if (env.DATABASE_URL !== env.DATABASE_TEST_URL) {
    throw new TestIsolationError('DATABASE_URL y DATABASE_TEST_URL deben ser idénticas.');
  }

  const target: TestDatabaseTarget = {
    runId,
    host: testUrl.hostname,
    port: testUrl.port || '5432',
    database: decodeURIComponent(testUrl.pathname.replace(/^\//, '')),
    user: decodeURIComponent(testUrl.username),
  };

  if (!LOOPBACK_HOSTS.has(target.host)) {
    throw new TestIsolationError(
      `la base de pruebas debe ser local (127.0.0.1); se recibió el host "${target.host}".`,
    );
  }
  if (!target.database.endsWith('_test')) {
    throw new TestIsolationError(`la base "${target.database}" no es una base de pruebas.`);
  }

  // backup.sh usa libpq: con PG* ausentes caería en sus valores por defecto (otro servidor)
  const unexpected = Object.keys(env).filter(
    (name) => name.startsWith('PG') && env[name] !== undefined && !ALLOWED_LIBPQ_VARIABLES.has(name),
  );
  if (unexpected.length > 0) {
    throw new TestIsolationError(
      `variables de PostgreSQL no admitidas en pruebas: ${unexpected.sort().join(', ')}.`,
    );
  }
  const libpq: Array<[string, string]> = [
    ['PGHOST', target.host],
    ['PGPORT', target.port],
    ['PGDATABASE', target.database],
    ['PGUSER', target.user],
    ['PGPASSWORD', decodeURIComponent(testUrl.password)],
  ];
  for (const [name, expected] of libpq) {
    if (env[name] !== expected) {
      throw new TestIsolationError(`${name} debe coincidir con DATABASE_TEST_URL.`);
    }
  }

  checkRunDirectory(env, runId, repositoryRoot);

  if (env.BACKUP_REMOTE || env.BACKUP_AGE_RECIPIENT || env.BACKUP_REQUIRE_OFFSITE === 'true') {
    throw new TestIsolationError('las pruebas no pueden usar un destino externo de respaldos.');
  }

  return target;
}

/** Lee la marca de ejecución de la base a la que llega realmente la conexión. */
export async function readTestRunMarker(connectionString: string): Promise<string | null> {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const result = await client.query<{ marker: string | null }>(
      `SELECT shobj_description(oid, 'pg_database') AS marker
         FROM pg_database WHERE datname = current_database()`,
    );
    return result.rows[0]?.marker ?? null;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Falla de forma segura si no puede confirmar que la conexión efectiva llega a la base
 * temporal de esta ejecución. No modifica nada.
 */
export async function assertTestIsolation(
  env: NodeJS.ProcessEnv = process.env,
  repositoryRoot: string | null = findRepositoryRoot(),
): Promise<TestDatabaseTarget> {
  const target = checkTestEnvironment(env, repositoryRoot);
  const where = `${target.host}:${target.port}/${target.database}`;

  let marker: string | null;
  try {
    marker = await readTestRunMarker(env.DATABASE_TEST_URL as string);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new TestIsolationError(
      `no fue posible conectarse a ${where} para confirmar la base temporal (${reason.replace(/postgres(ql)?:\/\/[^@\s]+@/g, '***@')}).`,
    );
  }
  if (marker !== testRunMarker(target.runId)) {
    throw new TestIsolationError(`la base ${where} no es la base temporal de esta ejecución.`);
  }
  return target;
}
