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

/**
 * Criterio de terminado de las correcciones del cliente (2026-11-01): una venta a crédito
 * aparece en cuentas por cobrar, se abona con un recibo de caja, el saldo baja, "Ver abonos"
 * muestra el recibo y el dinero entra a caja.
 */
test('una venta a crédito se abona con un recibo de caja y el saldo baja', async ({ page }) => {
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

  // La cartera ya no registra abonos: solo consulta
  await page.goto('/receivables');
  const row = page.getByRole('row', { name: new RegExp(sale.invoiceNumber) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: /^Abonar$/ })).toHaveCount(0);

  // Recibo de caja: abono a cartera eligiendo cliente y factura
  await page.goto('/treasury/receipts');
  await page.getByRole('button', { name: 'Nuevo recibo de caja' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo recibo de caja' });
  await dialog.getByRole('combobox', { name: /Cliente/ }).fill(fixtures.customer.documentNumber);
  await page.getByRole('option', { name: new RegExp(fixtures.customer.documentNumber) }).click();
  await dialog.getByRole('checkbox', { name: `Seleccionar ${sale.invoiceNumber}` }).check();
  await dialog.getByLabel(`Valor a aplicar a ${sale.invoiceNumber}`).fill('3000');
  await dialog.getByLabel(/Concepto/).fill('Abono parcial E2E');
  await dialog.getByRole('button', { name: 'Registrar' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText(/Recibo de caja RC-\d+ registrado/)).toBeVisible();

  const receivables = await call<{ items: { id: string; saleId: string; balance: string | number }[] }>(
    admin,
    'get',
    `receivables?customerId=${fixtures.customer.id}`,
  );
  const receivable = receivables.items.find((item) => item.saleId === sale.id);
  expect(Number(receivable?.balance)).toBe(5000);

  // "Ver abonos" muestra el recibo y el saldo después del abono
  await page.goto('/receivables');
  await page
    .getByRole('row', { name: new RegExp(sale.invoiceNumber) })
    .getByRole('button', { name: /Ver Abonos/ })
    .click();
  const movements = page.getByRole('dialog');
  await expect(movements.getByText(/^RC-\d+$/)).toBeVisible();
  await expect(movements.getByRole('cell', { name: /\$5\.000,00/ }).last()).toBeVisible();

  // El dinero entra a caja con el concepto del recibo
  await page.goto('/cash');
  await expect(page.getByText('Abono parcial E2E')).toBeVisible();
  await admin.dispose();
});
