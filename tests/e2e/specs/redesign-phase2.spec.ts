import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  adminStateFile,
  apiAs,
  createStockedProduct,
  loadFixtures,
  lotQuantities,
} from '../support/api';

/**
 * Criterio de aceptación de la fase 2 del rediseño (2026-11-14): una venta de prueba se completa
 * con teclado, se ubica en el historial y desde su detalle se inicia una devolución parcial.
 * Las capturas quedan en docs/rediseno/fase-2/ con datos creados por la propia corrida.
 */
const fixtures = loadFixtures();
const shots = path.resolve(__dirname, '../../../docs/rediseno/fase-2');
test.use({ storageState: adminStateFile });

async function shot(page: Page, name: string) {
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
}

test('venta con teclado, ubicación en el historial y devolución parcial desde el detalle', async ({
  page,
}) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Rediseño Teclado',
    basePrice: 2500,
    lots: [{ suffix: 'A', daysToExpire: 250, quantity: 30 }],
  });
  const lot = product.lots[0].lotNumber;

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/pos');
  const search = page.getByLabel(/Buscar producto por nombre/);
  // Foco inicial en el buscador y cliente resuelto (nunca un «Cargando cliente…» persistente)
  await expect(search).toBeFocused();
  await expect(page.getByTestId('pos-customer')).not.toContainText('Cargando');

  // Producto por código + Enter, tres unidades y F2 para cobrar: todo con teclado
  await page.keyboard.type(product.code);
  await page.keyboard.press('Enter');
  const quantity = page.getByRole('spinbutton', { name: `Cantidad de ${product.name}` });
  await expect(quantity).toHaveValue('1');
  await quantity.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(quantity).toHaveValue('3');
  await expect(page.getByRole('region', { name: 'Resumen de venta' })).toContainText('7.500');
  await shot(page, 'pos-carrito-1440');

  await page.keyboard.press('F2');
  const payment = page.getByRole('dialog');
  await expect(payment.getByLabel(/Efectivo Recibido/)).toBeFocused();
  await page.keyboard.type('10000');
  const confirmed = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/sales/confirm') && r.request().method() === 'POST',
  );
  await page.keyboard.press('Enter');
  const sale = (await (await confirmed).json()) as { id: string; invoiceNumber: string };
  await expect(page.getByText(/Comprobante N°:/)).toBeVisible();
  await shot(page, 'pos-comprobante-1440');

  // Enter en el comprobante inicia otra venta y devuelve el foco al buscador
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await expect(page.getByText(/El carrito está vacío/)).toBeVisible();
  await expect.poll(() => lotQuantities(admin, product.id)).toEqual({ [lot]: 27 });

  // Se ubica en el historial y se abre su detalle
  await page.goto('/sales');
  await page.getByTestId(`sale-detail-link-${sale.id}`).click();
  await expect(
    page.getByRole('heading', { name: `Venta ${sale.invoiceNumber}`, level: 1 }),
  ).toBeVisible();

  // Devolución parcial con la factura precargada y el impacto visible antes de confirmar
  await page.getByTestId('sale-detail-return-btn').click();
  const note = page.getByRole('dialog');
  await expect(note.getByText(`Factura ${sale.invoiceNumber}`)).toBeVisible();
  await note.getByLabel(`Cantidad a devolver de ${product.name}`).fill('1');
  await note.getByLabel('Motivo de la devolución').fill('Cliente devolvió una unidad sin abrir');
  await expect(note.getByTestId('credit-note-review-lines')).toContainText(`1 × ${product.name}`);
  const effects = note.getByTestId('credit-note-effects');
  await expect(effects).toContainText('de la caja abierta como egreso en efectivo');
  await expect(effects).toContainText('Las unidades vuelven a su lote original');
  await shot(page, 'devolucion-revision-1440');
  await note.getByRole('button', { name: 'Confirmar nota crédito' }).click();
  await expect(page.getByText(/NC-\d+/).first()).toBeVisible();
  await expect.poll(() => lotQuantities(admin, product.id)).toEqual({ [lot]: 28 });
  await admin.dispose();
});

test('ventana estrecha: el total y el cobro quedan visibles sin desplazamiento horizontal', async ({
  page,
}) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Rediseño Móvil',
    basePrice: 1200,
    lots: [{ suffix: 'A', daysToExpire: 250, quantity: 10 }],
  });
  await admin.dispose();

  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/pos');
  await page.getByLabel(/Buscar producto por nombre/).fill(product.code);
  await page.getByRole('option', { name: new RegExp(product.code) }).click();
  const bar = page.getByTestId('pos-mobile-total');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('1.200');
  await expect(bar.getByRole('button', { name: 'Cobrar' })).toBeEnabled();
  const box = await bar.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(780 + 1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(page, 'pos-360');
});
