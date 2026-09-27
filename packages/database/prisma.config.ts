import { defineConfig } from '@prisma/config';

if (typeof process.loadEnvFile === 'function') {
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



