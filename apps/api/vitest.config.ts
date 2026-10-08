import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    fileParallelism: false,
    // Los proyectos de Vitest no heredan los timeouts de la configuración raíz.
    // cleanTestDatabase + seedRbac contra PostgreSQL real supera el default de 10 s.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
