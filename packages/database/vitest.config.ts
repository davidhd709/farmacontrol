import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts', '**/*.test.ts'],
    fileParallelism: false,
    // FARM-AUD-014: solo contra la base temporal creada por `pnpm test`
    globalSetup: ['./src/testing/isolation.global-setup.ts'],
    maxWorkers: 1,
    minWorkers: 1,
    // Los proyectos de Vitest no heredan los timeouts de la configuración raíz.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
