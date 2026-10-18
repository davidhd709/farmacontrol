import { expect, test } from '@playwright/test';
import {
  apiAs,
  cashierStateFile,
  createStockedProduct,
  loadFixtures,
  lotQuantities,
} from '../support/api';

const fixtures = loadFixtures();
test.use({ storageState: cashierStateFile });

test('el cajero vende en efectivo y FEFO descuenta primero el lote que vence antes', async ({
  page,
}) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  // El lote lejano se recibe primero: FEFO debe ignorar el orden de llegada
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Acetaminofén FEFO',
    basePrice: 1000,
    lots: [
      { suffix: 'LEJANO', daysToExpire: 400, quantity: 50 },
      { suffix: 'CERCANO', daysToExpire: 120, quantity: 20 },
    ],
  });
  const [far, near] = product.lots;

  await page.goto('/pos');
  await page.getByLabel(/Buscar producto por nombre/).fill(product.code);
  await page.getByRole('option', { name: new RegExp(product.code) }).click();
  const quantity = page.getByRole('spinbutton', {
    name: new RegExp(`Cantidad de ${product.name}`),
  });
  await quantity.fill('25');
  await expect(page.getByText('TOTAL A PAGAR')).toBeVisible();

  await page.getByRole('button', { name: /Cobrar/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Asignación FEFO automática')).toBeVisible();
  await dialog.getByText(/Línea 1: 25 unidades base/).click();
  await expect(
    dialog.getByText(new RegExp(`Lote ${near.lotNumber} .* 20 unidades base`)),
  ).toBeVisible();
  await expect(
    dialog.getByText(new RegExp(`Lote ${far.lotNumber} .* 5 unidades base`)),
  ).toBeVisible();

  await dialog.getByLabel(/Efectivo Recibido/).fill('30000');
  await dialog.getByTestId('confirm-payment-btn').click();
  await expect(page.getByText(/Comprobante N°:/)).toBeVisible();

  await expect
    .poll(() => lotQuantities(admin, product.id))
    .toEqual({ [near.lotNumber]: 0, [far.lotNumber]: 45 });
  await admin.dispose();
});

test('la vista previa avisa el faltante y no deja cobrar más de lo vendible', async ({ page }) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Ibuprofeno faltante',
    basePrice: 500,
    lots: [{ suffix: 'UNICO', daysToExpire: 200, quantity: 3 }],
  });
  await admin.dispose();

  await page.goto('/pos');
  await page.getByLabel(/Buscar producto por nombre/).fill(product.code);
  await page.getByRole('option', { name: new RegExp(product.code) }).click();
  const quantity = page.getByRole('spinbutton', {
    name: new RegExp(`Cantidad de ${product.name}`),
  });
  await quantity.fill('5');
  // El carrito limita la cantidad a las existencias que conoce y lo explica
  await expect(page.getByText(/Stock insuficiente/)).toBeVisible();
  await expect(quantity).toHaveValue('1');
});
