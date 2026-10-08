import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts', '**/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    // Los proyectos de Vitest no heredan los timeouts de la configuración raíz.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
