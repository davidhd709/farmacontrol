import { expect, test } from '@playwright/test';
import {
  adminStateFile,
  apiAs,
  businessDay,
  call,
  loadFixtures,
  lotQuantities,
  uniqueCode,
} from '../support/api';

const fixtures = loadFixtures();
test.use({ storageState: adminStateFile });

test('recibir una compra desde la web crea el lote con su existencia', async ({ page }) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const code = uniqueCode('E2E');
  const product = await call<{ id: string; name: string }>(admin, 'post', 'products', {
    categoryId: fixtures.categoryId,
    code,
    name: `Losartán compra ${code}`,
    requiresLotControl: true,
    basePrice: 900,
    baseCost: 450,
  });
  const invoice = uniqueCode('FAC');
  const lotNumber = `${code}-L1`;

  await page.goto('/purchases/receive');
  await page.getByRole('combobox', { name: /Proveedor/ }).click();
  await page.getByRole('option', { name: /Droguería Mayorista E2E/ }).click();
  await page.getByLabel(/Número de Factura/).fill(invoice);
  await page
    .getByRole('combobox', { name: /Producto/ })
    .first()
    .click();
  await page.getByRole('option', { name: new RegExp(code) }).click();
  await page
    .getByLabel(/Número de Lote/)
    .first()
    .fill(lotNumber);
  await page
    .getByLabel(/Fecha de Vencimiento \*/)
    .first()
    .fill(businessDay(365));
  await page
    .getByLabel(/^Cantidad/)
    .first()
    .fill('60');
  await page
    .getByLabel(/^Costo por/)
    .first()
    .fill('450');

  await page
    .getByRole('button', { name: /Confirmar Recepción/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Sí, Confirmar Recepción' }).click();
  await expect(page).toHaveURL(/\/purchases$/);

  // El lote se guarda en mayúsculas, como lo normaliza el formulario
  await expect
    .poll(() => lotQuantities(admin, product.id))
    .toEqual({ [lotNumber.toUpperCase()]: 60 });
  await admin.dispose();
});
