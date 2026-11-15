import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  adminStateFile,
  apiAs,
  businessDay,
  call,
  loadFixtures,
  lotQuantities,
  uniqueCode,
} from '../support/api';
import { fillDateField } from '../support/date-field';

/**
 * Criterio de aceptación de la fase 3 del rediseño (2026-11-14): recibir una compra con varias
 * presentaciones y lotes, consultar su movimiento y preparar una devolución parcial al proveedor
 * con cantidades y efectos claros. Capturas en docs/rediseno/fase-3/ con datos de la corrida.
 */
const fixtures = loadFixtures();
const shots = path.resolve(__dirname, '../../../docs/rediseno/fase-3');
test.use({ storageState: adminStateFile });

async function shot(page: Page, name: string) {
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
}

test('compra con dos presentaciones y dos lotes, su Kardex y una devolución parcial', async ({
  page,
}) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const code = uniqueCode('F3');
  const product = await call<{ id: string; name: string }>(admin, 'post', 'products', {
    categoryId: fixtures.categoryId,
    code,
    name: `Rediseño compra ${code}`,
    inventoryControlMode: 'LOT_EXPIRY',
    basePrice: 900,
    baseCost: 400,
  });
  await call(admin, 'post', `products/${product.id}/presentations`, {
    name: 'Caja x 10',
    conversionFactor: 10,
    price: 9000,
    cost: 4000,
    purchaseEnabled: true,
    saleEnabled: true,
  });
  const invoice = uniqueCode('FAC');
  const lotBox = `${code}-CAJA`;
  const lotUnit = `${code}-UNID`;

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/purchases/receive');

  // Paso 1: datos de la factura
  await page.getByRole('combobox', { name: /Proveedor/ }).click();
  await page.getByRole('option', { name: /Droguería Mayorista E2E/ }).click();
  await page.getByLabel(/Número de Factura/).fill(invoice);
  await page.getByRole('button', { name: 'Continuar a productos' }).click();
  await expect(page.getByTestId('purchase-summary')).toContainText(invoice);

  // Paso 2: línea 1 en cajas (lote A) y línea 2 en unidad base (lote B)
  await page
    .getByRole('combobox', { name: /^Producto/ })
    .first()
    .click();
  await page.getByRole('option', { name: new RegExp(code) }).click();
  await page
    .getByRole('combobox', { name: /Presentación/ })
    .first()
    .click();
  await page.getByRole('option', { name: /Caja x 10/ }).click();
  await page
    .getByLabel(/Número de Lote/)
    .first()
    .fill(lotBox);
  await fillDateField(
    page.getByRole('group', { name: /Fecha de Vencimiento \*/ }).first(),
    businessDay(400),
  );
  await page
    .getByLabel(/^Cantidad/)
    .first()
    .fill('2');
  await page
    .getByLabel(/^Costo por/)
    .first()
    .fill('4000');

  await page.getByRole('button', { name: 'Agregar Otra Línea' }).click();
  await page
    .getByRole('combobox', { name: /^Producto/ })
    .nth(1)
    .click();
  await page.getByRole('option', { name: new RegExp(code) }).click();
  await page
    .getByLabel(/Número de Lote/)
    .nth(1)
    .fill(lotUnit);
  await fillDateField(
    page.getByRole('group', { name: /Fecha de Vencimiento \*/ }).nth(1),
    businessDay(500),
  );
  await page
    .getByLabel(/^Cantidad/)
    .nth(1)
    .fill('5');
  await page
    .getByLabel(/^Costo por/)
    .nth(1)
    .fill('400');

  // Paso 3: revisión con equivalencias y efecto antes de confirmar
  await page.getByRole('button', { name: 'Revisar totales' }).click();
  const review = page.getByRole('table', { name: 'Líneas a recibir' });
  await expect(review).toContainText('Caja x 10 (x10');
  await expect(review).toContainText(lotBox.toUpperCase());
  await expect(page.getByTestId('purchase-effects')).toContainText('Entran 25 unidades base');
  await shot(page, 'recepcion-revision-1440');
  await page.getByRole('button', { name: 'Confirmar recepción de compra' }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  await expect
    .poll(() => lotQuantities(admin, product.id))
    .toEqual({ [lotBox.toUpperCase()]: 20, [lotUnit.toUpperCase()]: 5 });

  // Estado en español y movimientos de la compra en el Kardex
  const row = page.getByRole('row', { name: new RegExp(invoice) });
  await expect(row).toContainText('Recibida');
  await row.getByRole('button', { name: 'Ver Detalle' }).click();
  await page.getByRole('link', { name: 'Ver movimientos' }).click();
  await expect(page).toHaveURL(/\/inventory\/movements\?ref=/);
  await expect(page.getByText(`Mostrando los movimientos de la compra ${invoice}`)).toBeVisible();
  await expect(page.getByText('Entrada por compra')).toHaveCount(2);
  await expect(page.getByText('ENTRADA_COMPRA')).toHaveCount(0);
  await shot(page, 'kardex-compra-1440');

  // Devolución parcial al proveedor desde la compra
  await page.goto('/purchases');
  await page
    .getByRole('row', { name: new RegExp(invoice) })
    .getByRole('button', { name: 'Ver Detalle' })
    .click();
  await page.getByTestId('purchase-detail-return-btn').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('20 u. base')).toBeVisible();
  await dialog.getByRole('spinbutton').first().fill('1');
  await dialog.getByLabel('Motivo de la devolución').fill('Caja con empaque dañado');
  const effects = dialog.getByTestId('debit-note-effects');
  await expect(effects).toContainText(`Salen 10 unidades base del lote ${lotBox.toUpperCase()}`);
  await expect(effects).toContainText('la cuenta por pagar');
  await shot(page, 'devolucion-proveedor-1440');
  await dialog.getByRole('button', { name: 'Confirmar nota débito' }).click();
  await expect(page.getByText(/Nota débito ND-\d+ registrada correctamente/)).toBeVisible();
  await expect
    .poll(() => lotQuantities(admin, product.id))
    .toEqual({ [lotBox.toUpperCase()]: 10, [lotUnit.toUpperCase()]: 5 });
  await admin.dispose();
});
