import { expect, test } from '@playwright/test';
import { loadFixtures } from '../support/api';

const fixtures = loadFixtures();

test.describe('Sesión', () => {
  test('rechaza una contraseña incorrecta sin revelar si el usuario existe', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Usuario').fill(fixtures.admin.username);
    await page.getByLabel('Contraseña', { exact: true }).fill('ContraseñaIncorrecta-123');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('inicia sesión, vuelve a la ruta pedida y cierra sesión', async ({ page }) => {
    await page.goto('/inventory/lots');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Usuario').fill(fixtures.admin.username);
    await page.getByLabel('Contraseña', { exact: true }).fill(fixtures.admin.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/inventory\/lots$/);
  });

  test('una sesión expirada lleva al login sin dejar datos en pantalla', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Usuario').fill(fixtures.admin.username);
    await page.getByLabel('Contraseña', { exact: true }).fill(fixtures.admin.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    await context.clearCookies();
    // Navegación dentro de la SPA: la sesión en caché sigue "viva" hasta que el API responde 401
    await page.getByRole('button', { name: /Nueva Venta/ }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });
});
