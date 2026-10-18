import { expect, test } from '@playwright/test';
import {
  adminStateFile,
  apiAs,
  confirmSaleViaApi,
  createStockedProduct,
  loadFixtures,
  lotQuantities,
} from '../support/api';

const fixtures = loadFixtures();
test.use({ storageState: adminStateFile });

test('nota crédito parcial devuelve unidades al lote y anular restituye el resto', async ({
  page,
}) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Omeprazol devolución',
    basePrice: 700,
    lots: [{ suffix: 'A', daysToExpire: 300, quantity: 40 }],
  });
  const lot = product.lots[0].lotNumber;
  const returned = await confirmSaleViaApi(admin, {
    paymentMethod: 'EFECTIVO',
    amountPaid: 7000,
    items: [{ productId: product.id, quantityCommercial: 10 }],
  });
  const cancelled = await confirmSaleViaApi(admin, {
    paymentMethod: 'EFECTIVO',
    amountPaid: 3500,
    items: [{ productId: product.id, quantityCommercial: 5 }],
  });
  expect(await lotQuantities(admin, product.id)).toEqual({ [lot]: 25 });

  await page.goto('/sales');
  await page.getByTestId(`credit-note-btn-${returned.id}`).click();
  const noteDialog = page.getByRole('dialog');
  await noteDialog.getByLabel(new RegExp(`Cantidad a devolver de ${product.name}`)).fill('4');
  await noteDialog.getByLabel('Motivo de la devolución').fill('Cliente devolvió cajas sin abrir');
  await noteDialog.getByRole('button', { name: 'Confirmar nota crédito' }).click();
  await expect(page.getByText(/Nota crédito NC-\d+ registrada correctamente/)).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect.poll(() => lotQuantities(admin, product.id)).toEqual({ [lot]: 29 });

  await page.getByTestId(`cancel-sale-btn-${cancelled.id}`).click();
  await page
    .getByTestId('cancel-reason-input')
    .locator('textarea, input')
    .first()
    .fill('Venta registrada por error');
  await page.getByTestId('confirm-cancel-sale-btn').click();
  await expect(page.getByTestId('cancel-sale-dialog')).toBeHidden();
  await expect.poll(() => lotQuantities(admin, product.id)).toEqual({ [lot]: 34 });

  // Una venta con nota crédito ya no se puede anular (AUD-002)
  const response = await admin.post(`/api/v1/sales/${returned.id}/cancel`, {
    data: { reason: 'Intento de doble devolución' },
  });
  expect(response.status()).toBe(409);
  await admin.dispose();
});
