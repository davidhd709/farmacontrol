import { expect, test } from '@playwright/test';
import { apiAs, cashierStateFile, loadFixtures } from '../support/api';

const fixtures = loadFixtures();
test.use({ storageState: cashierStateFile });

test('el cajero no ve ni abre módulos sin permiso, y el API también lo rechaza', async ({
  page,
}) => {
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await expect(menu.getByRole('link', { name: 'Punto de venta' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Libro diario' })).toHaveCount(0);

  for (const path of ['/users', '/accounting/journal', '/purchases/receive', '/backups']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Sin permiso' })).toBeVisible();
  }

  const cashier = await apiAs(fixtures.cashier.username, fixtures.cashier.password);
  for (const path of ['users', 'accounting/purposes', 'purchases', 'reports/sales']) {
    const response = await cashier.get(`/api/v1/${path}`);
    expect(response.status(), path).toBe(403);
  }
  await cashier.dispose();
});
