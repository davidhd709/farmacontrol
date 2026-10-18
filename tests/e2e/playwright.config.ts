import { defineConfig, devices } from '@playwright/test';

const outputDir = process.env.E2E_OUTPUT_DIR ?? '.test-runs/e2e-local';

/**
 * Las pruebas comparten una sola base temporal: se ejecutan en serie y cada una crea sus
 * propios productos y lotes por API para no depender del orden.
 */
export default defineConfig({
  testDir: './specs',
  outputDir: `${outputDir}/artifacts`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { outputFolder: `${outputDir}/report`, open: 'never' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
