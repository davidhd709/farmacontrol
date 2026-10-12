import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TEST_RUN_DIR_ENV,
  TEST_RUN_ID_ENV,
  TEST_RUN_STAMP_FILE,
  TestIsolationError,
  assertTestIsolation,
  checkTestEnvironment,
  findRepositoryRoot,
} from '../src/test-isolation';
import { cleanTestDatabase, prisma, resolveDatabaseUrl } from '../src/client';

const execFileAsync = promisify(execFile);

/**
 * FARM-AUD-014: la protección no depende del nombre `*_test` sino de que la base alcanzada
 * sea la temporal de esta ejecución, y los respaldos de prueba solo pueden escribirse (y
 * someterse a la retención de backup.sh) dentro del directorio propio de la ejecución.
 */
describe('Aislamiento de la base de pruebas (FARM-AUD-014)', () => {
  const repoRoot = findRepositoryRoot() as string;
  const runId = process.env[TEST_RUN_ID_ENV] as string;
  const otherRunId = '20000101000000-000000000000';
  const probeDb = `farmacia_probe_${Date.now()}_test`;
  const scratch: string[] = [];

  const authorizedEnv = (): NodeJS.ProcessEnv => ({ ...process.env });
  const withDatabase = (env: NodeJS.ProcessEnv, database: string): NodeJS.ProcessEnv => {
    const url = new URL(env.DATABASE_TEST_URL as string);
    url.pathname = `/${database}`;
    return { ...env, DATABASE_URL: url.toString(), DATABASE_TEST_URL: url.toString(), PGDATABASE: database };
  };
  const tempDir = (prefix: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    scratch.push(dir);
    return dir;
  };
  /** Directorio con la estructura que crea el script: nombre, sello y backups/. */
  const fakeRunDir = (id: string, options: { stamp?: string | null } = {}): string => {
    const dir = tempDir(`farmacontrol-test-${id}.`);
    if (options.stamp !== null) {
      fs.writeFileSync(path.join(dir, TEST_RUN_STAMP_FILE), `${options.stamp ?? id}\n`);
    }
    fs.mkdirSync(path.join(dir, 'backups'));
    return dir;
  };
  const withRunDir = (runDir: string, backupDir = path.join(runDir, 'backups')): NodeJS.ProcessEnv => ({
    ...authorizedEnv(),
    [TEST_RUN_DIR_ENV]: runDir,
    BACKUP_DIR: backupDir,
  });

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: process.env.DATABASE_TEST_URL });
    await admin.connect();
    // Misma instancia, mismas credenciales y nombre terminado en _test, pero sin marca
    await admin.query(`CREATE DATABASE ${probeDb}`);
    await admin.end();
  });

  afterAll(async () => {
    const admin = new pg.Client({ connectionString: process.env.DATABASE_TEST_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${probeDb} WITH (FORCE)`);
    await admin.end();
    await prisma.$disconnect();
    for (const dir of scratch) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('base de datos', () => {
    it('acepta la base temporal de la ejecución en curso', async () => {
      const target = await assertTestIsolation(authorizedEnv(), repoRoot);
      expect(target.database).toBe('farmacia_test');
      expect(target.host).toBe('127.0.0.1');
      expect(target.runId).toBe(runId);
    });

    it('rechaza otra base *_test del mismo servidor que no lleva la marca de la ejecución', async () => {
      await expect(assertTestIsolation(withDatabase(authorizedEnv(), probeDb), repoRoot)).rejects.toThrow(
        /no es la base temporal de esta ejecución/,
      );
    });

    it('rechaza la base temporal si el identificador de ejecución no coincide', async () => {
      const env = { ...authorizedEnv(), [TEST_RUN_ID_ENV]: otherRunId };
      await expect(assertTestIsolation(env, repoRoot)).rejects.toThrow(TestIsolationError);
    });

    it('falla de forma segura si no puede conectarse para confirmar el destino', async () => {
      const env = authorizedEnv();
      const url = new URL(env.DATABASE_TEST_URL as string);
      url.port = '1';
      const unreachable = { ...env, DATABASE_URL: url.toString(), DATABASE_TEST_URL: url.toString(), PGPORT: '1' };
      await expect(assertTestIsolation(unreachable, repoRoot)).rejects.toThrow(/no fue posible conectarse/);
    });

    it('rechaza DATABASE_URL distinta de DATABASE_TEST_URL', () => {
      const env = withDatabase(authorizedEnv(), 'farmacia_test');
      env.DATABASE_URL = (env.DATABASE_URL as string).replace('/farmacia_test', '/farmacia_db');
      expect(() => checkTestEnvironment(env, repoRoot)).toThrow(/idénticas/);
    });

    it('rechaza un host que no es local aunque la base se llame *_test', () => {
      const env = authorizedEnv();
      const url = new URL(env.DATABASE_TEST_URL as string);
      url.hostname = 'db.farmacia.example';
      const remote = { ...env, DATABASE_URL: url.toString(), DATABASE_TEST_URL: url.toString(), PGHOST: url.hostname };
      expect(() => checkTestEnvironment(remote, repoRoot)).toThrow(/debe ser local/);
    });

    it('cleanTestDatabase no borra nada si la ejecución no es la propietaria de la base', async () => {
      const category = await prisma.category.create({ data: { name: `Aislamiento ${Date.now()}` } });
      process.env[TEST_RUN_ID_ENV] = otherRunId;
      try {
        await expect(cleanTestDatabase()).rejects.toThrow(/no es la base temporal/);
      } finally {
        process.env[TEST_RUN_ID_ENV] = runId;
      }
      expect(await prisma.category.count({ where: { id: category.id } })).toBe(1);
      await cleanTestDatabase();
    });

    it('en una ejecución autorizada no completa la conexión con un .env local', () => {
      const dir = tempDir('farmacontrol-dotenv-');
      fs.writeFileSync(
        path.join(dir, '.env'),
        'DATABASE_TEST_URL=postgresql://dev:dev@127.0.0.1:5434/farmacia_test?schema=public\n',
      );
      const previousCwd = process.cwd();
      const previousUrl = process.env.DATABASE_TEST_URL;
      process.chdir(dir);
      delete process.env.DATABASE_TEST_URL;
      try {
        expect(() => resolveDatabaseUrl({ forceTest: true })).toThrow(/DATABASE_TEST_URL no está configurada/);
      } finally {
        process.env.DATABASE_TEST_URL = previousUrl;
        process.chdir(previousCwd);
      }
    });
  });

  describe('variables de entorno', () => {
    it.each([
      ['sin identificador de ejecución', { [TEST_RUN_ID_ENV]: undefined }, /FARMACIA_TEST_RUN_ID/],
      ['con identificador malformado', { [TEST_RUN_ID_ENV]: 'cualquier-cosa' }, /FARMACIA_TEST_RUN_ID/],
      ['con NODE_ENV distinto de test', { NODE_ENV: 'development' }, /NODE_ENV/],
      ['sin DATABASE_TEST_URL', { DATABASE_TEST_URL: undefined }, /DATABASE_TEST_URL/],
      ['con PGPORT del contenedor de desarrollo', { PGPORT: '5434' }, /PGPORT/],
      ['sin PGHOST (backup.sh usaría su valor por defecto)', { PGHOST: undefined }, /PGHOST/],
      ['con PGPASSWORD distinta de la URL', { PGPASSWORD: 'otra' }, /PGPASSWORD/],
      ['con destino externo de respaldos', { BACKUP_REMOTE: 'offsite:farmacia' }, /destino externo/],
      ['exigiendo copia externa', { BACKUP_REQUIRE_OFFSITE: 'true' }, /destino externo/],
    ])('rechaza el entorno %s', (_caso, overrides, message) => {
      const env = { ...authorizedEnv(), ...overrides };
      expect(() => checkTestEnvironment(env, repoRoot)).toThrow(message);
    });

    it.each([
      ['host', '10.0.0.5'],
      ['hostaddr', '10.0.0.5'],
      ['port', '5432'],
      ['user', 'otro'],
      ['password', 'otra'],
      ['dbname', 'farmacia_db'],
      ['options', '-c search_path=otro'],
      ['service', 'farmacia_prod'],
      ['sslmode', 'disable'],
    ])('rechaza el parámetro ?%s= en la URL, que node-postgres antepone a la URL validada', (param, value) => {
      const env = authorizedEnv();
      const url = new URL(env.DATABASE_TEST_URL as string);
      url.searchParams.set(param, value);
      const overridden = { ...env, DATABASE_URL: url.toString(), DATABASE_TEST_URL: url.toString() };
      expect(() => checkTestEnvironment(overridden, repoRoot)).toThrow(/parámetros de conexión/);
    });

    it.each([
      ['PGHOSTADDR', '10.0.0.5'],
      ['PGSERVICE', 'farmacia_prod'],
      ['PGSERVICEFILE', '/etc/pg_service.conf'],
      ['PGPASSFILE', '/home/usuario/.pgpass'],
      ['PGOPTIONS', '-c search_path=otro'],
      ['PGSSLMODE', 'disable'],
      ['PGCLUSTER', '16/main'],
    ])('rechaza la variable libpq %s, que podría desviar pg_dump o node-postgres', (name, value) => {
      const env = { ...authorizedEnv(), [name]: value };
      expect(() => checkTestEnvironment(env, repoRoot)).toThrow(new RegExp(`no admitidas.*${name}`));
    });
  });

  describe('directorio de respaldos (AUD14-01)', () => {
    it('acepta el directorio temporal legítimo de la ejecución', () => {
      expect(() => checkTestEnvironment(authorizedEnv(), repoRoot)).not.toThrow();
      expect(path.basename(process.env[TEST_RUN_DIR_ENV] as string)).toMatch(new RegExp(`^farmacontrol-test-${runId}\\.`));
    });

    it.each([
      ['/var/backups/farmacia', () => '/var/backups/farmacia'],
      ['un directorio absoluto externo', () => tempDir('farmacontrol-respaldos-reales-')],
      ['el directorio de respaldos del proyecto', () => path.join(repoRoot, 'infra', 'backups')],
      ['una ruta relativa', () => 'infra/backups'],
      [
        'una ruta con ../ que sale del directorio autorizado',
        () => path.join(process.env[TEST_RUN_DIR_ENV] as string, 'backups', '..', '..', path.basename(tempDir('farmacontrol-fuera-'))),
      ],
    ])('rechaza BACKUP_DIR = %s', (_caso, backupDir) => {
      const env = { ...authorizedEnv(), BACKUP_DIR: backupDir() };
      expect(() => checkTestEnvironment(env, repoRoot)).toThrow(/BACKUP_DIR/);
    });

    it('rechaza un enlace simbólico dentro del directorio autorizado que apunta fuera de él', () => {
      const runDir = fakeRunDir(runId);
      const outside = tempDir('farmacontrol-fuera-');
      fs.symlinkSync(outside, path.join(runDir, 'enlace'));
      expect(() => checkTestEnvironment(withRunDir(runDir, path.join(runDir, 'enlace')), repoRoot)).toThrow(/BACKUP_DIR/);
    });

    it('rechaza que backups/ sea un enlace simbólico hacia otro directorio', () => {
      const runDir = fakeRunDir(runId);
      const outside = tempDir('farmacontrol-fuera-');
      fs.rmdirSync(path.join(runDir, 'backups'));
      fs.symlinkSync(outside, path.join(runDir, 'backups'));
      expect(() => checkTestEnvironment(withRunDir(runDir), repoRoot)).toThrow(/enlace simbólico/);
    });

    it('rechaza un directorio de ejecución con otro identificador', () => {
      const env = { ...authorizedEnv(), [TEST_RUN_ID_ENV]: otherRunId };
      expect(() => checkTestEnvironment(env, repoRoot)).toThrow(/no corresponde a esta ejecución/);
    });

    it('rechaza un directorio de ejecución sin la marca requerida', () => {
      const runDir = fakeRunDir(runId, { stamp: null });
      expect(() => checkTestEnvironment(withRunDir(runDir), repoRoot)).toThrow(/no tiene la marca/);
    });

    it('rechaza un directorio cuya marca pertenece a otra ejecución', () => {
      const runDir = fakeRunDir(runId, { stamp: otherRunId });
      expect(() => checkTestEnvironment(withRunDir(runDir), repoRoot)).toThrow(/marca .* no corresponde/);
    });

    it('rechaza un directorio de ejecución inexistente', () => {
      const runDir = path.join(os.tmpdir(), `farmacontrol-test-${runId}.no-existe`);
      expect(() => checkTestEnvironment(withRunDir(runDir), repoRoot)).toThrow(/no existe o no se puede verificar/);
    });

    it('rechaza un directorio de ejecución que es un enlace simbólico', () => {
      const runDir = fakeRunDir(runId);
      const link = path.join(tempDir('farmacontrol-enlaces-'), `farmacontrol-test-${runId}.enlace`);
      fs.symlinkSync(runDir, link);
      expect(() => checkTestEnvironment(withRunDir(link, path.join(runDir, 'backups')), repoRoot)).toThrow(
        /enlace simbólico/,
      );
    });

    it('rechaza un directorio de ejecución no canónico aunque resuelva al autorizado', () => {
      const runDir = process.env[TEST_RUN_DIR_ENV] as string;
      const env = { ...authorizedEnv(), [TEST_RUN_DIR_ENV]: path.join(runDir, 'backups') + `${path.sep}..` };
      expect(() => checkTestEnvironment(env, repoRoot)).toThrow(/ruta canónica/);
    });

    it('rechaza BACKUP_DIR no canónico aunque resuelva al directorio de respaldos', () => {
      const runDir = process.env[TEST_RUN_DIR_ENV] as string;
      const env = { ...authorizedEnv(), BACKUP_DIR: `${runDir}${path.sep}.${path.sep}backups` };
      expect(() => checkTestEnvironment(env, repoRoot)).toThrow(/ruta canónica/);
    });

    it('rechaza un enlace simbólico en un componente intermedio de la ruta', () => {
      const runDir = fakeRunDir(runId);
      const link = path.join(tempDir('farmacontrol-enlaces-'), 'padre');
      fs.symlinkSync(path.dirname(runDir), link);
      const viaLink = path.join(link, path.basename(runDir));
      expect(() => checkTestEnvironment(withRunDir(viaLink, path.join(viaLink, 'backups')), repoRoot)).toThrow(
        /ruta canónica/,
      );
    });

    it('falla si no puede determinar la raíz del repositorio en lugar de omitir la comprobación', () => {
      expect(() => checkTestEnvironment(authorizedEnv(), null)).toThrow(/raíz del repositorio/);
    });

    it('localiza la raíz del repositorio desde el módulo aunque el proceso corra fuera de él', () => {
      const previousCwd = process.cwd();
      process.chdir(tempDir('farmacontrol-cwd-externo-'));
      try {
        expect(findRepositoryRoot()).toBe(repoRoot);
        expect(() => checkTestEnvironment(authorizedEnv())).not.toThrow();
      } finally {
        process.chdir(previousCwd);
      }
    });

    it('rechaza un directorio de ejecución con escritura para otros usuarios', () => {
      const runDir = fakeRunDir(runId);
      fs.chmodSync(runDir, 0o777);
      expect(() => checkTestEnvironment(withRunDir(runDir), repoRoot)).toThrow(/escritura de otros usuarios/);
    });

    it('backup.sh se niega antes de aplicar la retención y conserva los respaldos preexistentes', async () => {
      const realBackups = tempDir('farmacontrol-respaldos-reales-');
      const oldDump = path.join(realBackups, 'farmacia_prod_20250101_000000.dump');
      fs.writeFileSync(oldDump, 'respaldo real');
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000);
      fs.utimesSync(oldDump, sixtyDaysAgo, sixtyDaysAgo);

      const env = { ...authorizedEnv(), BACKUP_DIR: realBackups, RETENTION_DAYS: '30' };
      const run = execFileAsync(path.join(repoRoot, 'infra', 'scripts', 'backup.sh'), [], { env });

      await expect(run).rejects.toMatchObject({ code: 1 });
      await run.catch((error: { stderr?: string }) => {
        expect(error.stderr).toMatch(/no es el directorio de respaldos de la ejecución/);
      });
      expect(fs.readdirSync(realBackups)).toEqual(['farmacia_prod_20250101_000000.dump']);
      expect(fs.readFileSync(oldDump, 'utf8')).toBe('respaldo real');
    });
  });
});
