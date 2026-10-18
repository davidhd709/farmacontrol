import { expect, test } from '@playwright/test';
import {
  adminStateFile,
  apiAs,
  call,
  confirmSaleViaApi,
  createStockedProduct,
  loadFixtures,
} from '../support/api';

const fixtures = loadFixtures();
test.use({ storageState: adminStateFile });

test('una venta a crédito abre cartera y un abono parcial baja el saldo', async ({ page }) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Amoxicilina crédito',
    basePrice: 800,
    lots: [{ suffix: 'A', daysToExpire: 300, quantity: 30 }],
  });
  const sale = await confirmSaleViaApi(admin, {
    customerId: fixtures.customer.id,
    paymentMethod: 'CREDITO',
    items: [{ productId: product.id, quantityCommercial: 10 }],
  });
  expect(Number(sale.total)).toBe(8000);

  await page.goto('/receivables');
  await page
    .getByRole('row', { name: new RegExp(sale.invoiceNumber) })
    .getByRole('button', { name: /Abonar/ })
    .click();
  await page.getByLabel('Monto del abono').fill('3000');
  await page.getByRole('button', { name: 'Registrar Abono' }).click();
  await page.getByRole('button', { name: 'Confirmar y Abonar' }).click();
  await expect(page.getByText('Abono registrado correctamente y aplicado al saldo.')).toBeVisible();

  const receivables = await call<{ items: { saleId: string; balance: string | number }[] }>(
    admin,
    'get',
    `receivables?customerId=${fixtures.customer.id}`,
  );
  const receivable = receivables.items.find((item) => item.saleId === sale.id);
  expect(Number(receivable?.balance)).toBe(5000);
  await admin.dispose();
});
