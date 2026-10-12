import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    fileParallelism: false,
    // FARM-AUD-014: solo contra la base temporal creada por `pnpm test`
    globalSetup: ['../../packages/database/src/testing/isolation.global-setup.ts'],
  },
});
