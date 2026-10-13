import { assertTestIsolation } from '../test-isolation';

/**
 * globalSetup de Vitest para los proyectos que usan PostgreSQL (api, database, worker).
 * Detiene la ejecución antes de la primera prueba si la conexión efectiva no es la base
 * temporal creada por `pnpm test` (FARM-AUD-014).
 */
export default async function setup(): Promise<void> {
  await assertTestIsolation();
}
