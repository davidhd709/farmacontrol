import { checkDatabaseConnection, prisma } from './client';

async function main(): Promise<void> {
  console.log('[db:check] Iniciando comprobación de conexión contra PostgreSQL 18...');
  let exitCode = 0;
  try {
    const result = await checkDatabaseConnection();
    if (result.ok) {
      console.log(`[db:check] ✅ ${result.message} (${result.durationMs}ms)`);
      console.log('[db:check] Resultado de la consulta:', JSON.stringify(result.result));
    } else {
      console.error(`[db:check] ❌ Error de conexión: ${result.message} (${result.durationMs}ms)`);
      exitCode = 1;
    }
  } catch (error) {
    console.error('[db:check] ❌ Error inesperado:', error instanceof Error ? error.message : String(error));
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
    process.exit(exitCode);
  }
}

void main();

