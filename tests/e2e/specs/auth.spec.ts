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
    // Se espera a que la SPA haya cargado la sesión y pintado la pantalla, no a un "networkidle":
    // bajo carga la red puede quedar quieta antes de /auth/me y las cookies se borrarían antes
    // de que la app tuviera sesión (iría al login sin pasar por la navegación que se prueba)
    await expect(page.getByRole('heading', { name: 'Catálogo de Productos' })).toBeVisible();
    const newSale = page.getByRole('link', { name: 'Nueva venta' });
    await expect(newSale).toBeVisible();

    await context.clearCookies();
    // Navegación dentro de la SPA: la sesión en caché sigue "viva" hasta que el API responde 401
    await newSale.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });
});
