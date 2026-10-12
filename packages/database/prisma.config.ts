import { defineConfig } from '@prisma/config';

// En una ejecución de pruebas autorizada (FARMACIA_TEST_RUN_ID) el entorno lo define el
// script de pruebas: un .env local no puede redirigir las migraciones
if (typeof process.loadEnvFile === 'function' && !process.env.FARMACIA_TEST_RUN_ID) {
  try {
    process.loadEnvFile();
  } catch {
    try {
      process.loadEnvFile('../../.env');
    } catch {
      // Ignorar si no existe
    }
  }
}

const datasourceUrl =
  process.env.NODE_ENV === 'test' && process.env.DATABASE_TEST_URL
    ? process.env.DATABASE_TEST_URL
    : process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: datasourceUrl,
  },
});



