import { checkDatabaseConnection, prisma } from './client';

async function main(): Promise<void> {
  console.log('[db:test:check] Comprobando conexión contra base de datos de pruebas (PostgreSQL 18)...');
  let exitCode = 0;
  try {
    const result = await checkDatabaseConnection();
    if (result.ok) {
      console.log(`[db:test:check] ✅ ${result.message} (${result.durationMs}ms)`);
      console.log(`[db:test:check] Base verificada: ${result.databaseName}`);
    } else {
      console.error(`[db:test:check] ❌ Error de conexión en tests: ${result.message} (${result.durationMs}ms)`);
      exitCode = 1;
    }
  } catch (error) {
    console.error('[db:test:check] ❌ Error de validación de tests:', error instanceof Error ? error.message : String(error));
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
    process.exit(exitCode);
  }
}

void main();
