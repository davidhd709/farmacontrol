import { assertTestIsolation } from '../test-isolation';

/** Verificación previa a `db:test:migrate`: termina con código 1 si no hay aislamiento. */
async function main(): Promise<void> {
  try {
    const target = await assertTestIsolation();
    console.log(
      `[test-isolation] ✅ Base temporal confirmada: ${target.host}:${target.port}/${target.database} (ejecución ${target.runId})`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

void main();
