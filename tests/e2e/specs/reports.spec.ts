import { expect, test } from '@playwright/test';
import {
  adminStateFile,
  apiAs,
  confirmSaleViaApi,
  createStockedProduct,
  loadFixtures,
} from '../support/api';

const fixtures = loadFixtures();
test.use({ storageState: adminStateFile });

test('el reporte de más vendidos refleja las ventas del día en unidad base', async ({ page }) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Loratadina ranking',
    basePrice: 300,
    lots: [{ suffix: 'A', daysToExpire: 300, quantity: 500 }],
  });
  await confirmSaleViaApi(admin, {
    paymentMethod: 'EFECTIVO',
    amountPaid: 90000,
    items: [{ productId: product.id, quantityCommercial: 300 }],
  });
  await admin.dispose();

  await page.goto('/reports');
  await page.getByRole('tab', { name: /más vendidos/i }).click();
  const row = page.getByRole('row', { name: new RegExp(product.code) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('300');
});
