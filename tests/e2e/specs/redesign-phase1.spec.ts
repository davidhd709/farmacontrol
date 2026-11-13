import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  adminStateFile,
  apiAs,
  confirmSaleViaApi,
  createStockedProduct,
  loadFixtures,
} from '../support/api';

/**
 * Recorrido en navegador del rediseño, fase 1 (2026-11-12): menú agrupado, rutas directas,
 * teclado, ventana estrecha, Inicio, POS y Detalle de venta. Las capturas quedan como evidencia
 * en docs/rediseno/fase-1/ y se hacen con datos de prueba creados por la propia corrida.
 */
const fixtures = loadFixtures();
const shots = path.resolve(__dirname, '../../../docs/rediseno/fase-1');
test.use({ storageState: adminStateFile });

async function shot(page: Page, name: string) {
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test('Inicio: indicadores, pendientes y accesos sin conteo de permisos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Accesos frecuentes' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ventas de hoy' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Efectivo en caja' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Vencimientos' })).toBeVisible();
  await expect(page.getByText(/permisos habilitados/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Nueva venta' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Alertas de vencimiento/ })).toBeVisible();
  if (process.env.APP_ENVIRONMENT === 'pruebas') {
    await expect(page.getByTestId('navbar-environment')).toHaveText('Pruebas');
    await expect(page.getByTestId('sidebar-environment')).toHaveText('Pruebas');
  }
  await expect(page.getByText('Producción')).toHaveCount(0);
  await shot(page, 'inicio-1440');
});

test('menú: grupo activo por URL directa, teclado y menú de usuario', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/treasury/receipts');
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await expect(menu.getByRole('button', { name: 'Tesorería' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(menu.getByRole('link', { name: 'Recibos de caja' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Teclado: abrir Inventario con Enter y entrar a Stock y lotes con Tab + Enter
  const inventory = menu.getByRole('button', { name: 'Inventario' });
  await inventory.focus();
  await page.keyboard.press('Enter');
  await expect(inventory).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link', { name: 'Stock y lotes' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/inventory\/lots$/);

  // Rutas anteriores siguen funcionando
  await page.goto('/customers');
  await expect(page).toHaveURL(/\/third-parties$/);

  await page.getByRole('button', { name: /^Menú de / }).click();
  await expect(page.getByRole('menuitem', { name: 'Cambiar contraseña' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeVisible();
  await shot(page, 'menu-usuario-1440');
  await page.keyboard.press('Escape');
  await shot(page, 'menu-agrupado-1440');
});

test('ventana estrecha: el menú se abre con el botón y no hay desplazamiento horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  await noHorizontalScroll(page);
  await shot(page, 'inicio-360');
  await page.getByRole('button', { name: 'Mostrar menú de navegación' }).click();
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await expect(menu.getByRole('link', { name: 'Inicio' })).toBeVisible();
  // El primer acceso no queda tapado por la barra superior
  const bar = await page.locator('header').first().boundingBox();
  const home = await menu.getByRole('link', { name: 'Inicio' }).boundingBox();
  expect(home!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1);
  await page.waitForTimeout(400); // fin de la animación del menú, solo para la captura
  await shot(page, 'menu-360');
  await menu.getByRole('button', { name: 'Ventas' }).click();
  await menu.getByRole('link', { name: 'Historial de ventas' }).click();
  await expect(page).toHaveURL(/\/sales$/);
  await expect(menu).toBeHidden();
});

test('POS y Detalle de venta con datos de prueba', async ({ page }) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Rediseño Detalle',
    basePrice: 4500,
    lots: [{ suffix: 'A', daysToExpire: 200, quantity: 20 }],
  });
  const sale = await confirmSaleViaApi(admin, {
    paymentMethod: 'EFECTIVO',
    amountPaid: 20000,
    items: [{ productId: product.id, quantityCommercial: 3 }],
  });
  await admin.dispose();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/pos');
  await expect(page.getByRole('heading', { name: 'Punto de venta', level: 1 })).toBeVisible();
  await shot(page, 'pos-1440');

  await page.goto('/sales');
  await page.getByTestId(`sale-detail-link-${sale.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/sales/${sale.id}$`));
  await expect(
    page.getByRole('heading', { name: `Venta ${sale.invoiceNumber}`, level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId('sale-status')).toHaveText('Completada');
  await expect(page.getByText(product.name)).toBeVisible();
  await expect(page.getByText(new RegExp(`${product.lots[0].lotNumber} \\(3 u\\.`))).toBeVisible();
  await expect(page.getByTestId('sale-detail-return-btn')).toBeVisible();
  await expect(page.getByTestId('sale-detail-cancel-btn')).toBeEnabled();
  // Ruta directa protegida por la misma guarda de /sales
  await page.reload();
  await expect(
    page.getByRole('heading', { name: `Venta ${sale.invoiceNumber}`, level: 1 }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Menú principal' })
      .getByRole('link', { name: 'Historial de ventas' }),
  ).toHaveAttribute('aria-current', 'page');
  await shot(page, 'detalle-venta-1440');

  await page.setViewportSize({ width: 360, height: 780 });
  await noHorizontalScroll(page);
  await shot(page, 'detalle-venta-360');
});
