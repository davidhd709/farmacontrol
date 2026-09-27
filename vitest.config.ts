import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['apps/api', 'apps/web', 'packages/database'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
