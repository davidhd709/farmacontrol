import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts', '**/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
