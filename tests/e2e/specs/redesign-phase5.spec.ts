import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  adminStateFile,
  apiAs,
  businessDay,
  call,
  createStockedProduct,
  loadFixtures,
} from '../support/api';
import { fillDateField } from '../support/date-field';

/**
 * Criterio de aceptación de la fase 5 del rediseño (2026-11-15): las operaciones que cambian
 * datos se confirman nombrando el registro y su efecto, con motivo cuando el flujo lo exige;
 * se cancelan con Escape devolviendo el foco; un error del servidor queda dentro del diálogo; y
 * las pantallas no se desbordan en escritorio, portátil ni ventana estrecha (las tablas anchas se
 * desplazan dentro de su contenedor). Los recorridos de venta, compra, devolución, corrección,
 * impresión, consulta contable, acceso denegado y cantidad superior a la disponible ya los cubren
 * las pruebas de las fases 1 a 4, pos-fefo y permissions. Capturas en docs/rediseno/fase-5/.
 */
const fixtures = loadFixtures();
const out = path.resolve(__dirname, '../../../docs/rediseno/fase-5');
test.use({ storageState: adminStateFile });

async function shot(page: Page, name: string, fullPage = true) {
  mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage });
}

/** dd/mm/aaaa, como lo muestra la web */
const shown = (iso: string) => iso.split('-').reverse().join('/');

test('bloqueo de documentos: se confirma con su alcance y una nota con fecha bloqueada se rechaza en su diálogo', async ({
  page,
}) => {
  const lockedThrough = businessDay(-1);
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  try {
    await page.goto('/accounting/periods');
    const lockCard = page.getByRole('region', { name: 'Bloqueo de documentos' });
    await fillDateField(lockCard.getByRole('group', { name: /Bloquear hasta/ }), lockedThrough);
    await lockCard.getByRole('textbox', { name: /^Motivo/ }).fill('Corte E2E fase 5 revisado');

    // Con teclado: Enter sobre el botón abre la confirmación; Escape la cierra y el foco vuelve
    const apply = lockCard.getByRole('button', { name: 'Aplicar bloqueo' });
    await apply.focus();
    await page.keyboard.press('Enter');
    const confirm = page.getByRole('dialog', { name: '¿Aplicar el bloqueo de documentos?' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByTestId('confirm-subject')).toContainText(shown(lockedThrough));
    await expect(confirm.getByTestId('confirm-effects')).toContainText('Corte E2E fase 5 revisado');
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(apply).toBeFocused();
    // El foco se ve: el botón enfocado con teclado lleva el contorno del tema
    await expect(apply).toHaveClass(/Mui-focusVisible/);
    await expect(apply).toHaveCSS('outline-style', 'solid');

    await page.keyboard.press('Enter');
    await expect(confirm).toBeVisible();
    await shot(page, 'bloqueo-confirmacion-1440', false);
    await confirm.getByRole('button', { name: 'Aplicar bloqueo' }).click();
    await expect(confirm).toBeHidden();
    await expect(lockCard.getByRole('status')).toContainText(
      `Documentos bloqueados hasta el ${shown(lockedThrough)}.`,
    );

    // Una nota contable con fecha bloqueada: el servidor la rechaza y el error queda en el
    // diálogo, con los datos escritos, para corregir la fecha o cancelar
    await page.goto('/accounting/journal');
    await page.getByRole('button', { name: 'Nueva nota contable' }).click();
    const note = page.getByRole('dialog', { name: 'Nueva nota contable' });
    await fillDateField(note.getByRole('group', { name: /Fecha contable/ }), lockedThrough);
    await note.getByRole('textbox', { name: /^Descripción/ }).fill('Nota E2E en fecha bloqueada');
    for (const [index, side] of [
      [1, 'Débito'],
      [2, 'Crédito'],
    ] as const) {
      await note.getByRole('combobox', { name: `Cuenta línea ${index}` }).click();
      await page
        .getByRole('option')
        .nth(index - 1)
        .click();
      await note.getByRole('textbox', { name: `${side} línea ${index}` }).fill('1000');
    }
    await note.getByRole('button', { name: 'Registrar nota' }).click();
    await expect(note.getByRole('alert')).toContainText(
      `los documentos están bloqueados hasta el ${lockedThrough}`,
    );
    await expect(note.getByRole('textbox', { name: /^Descripción/ })).toHaveValue(
      'Nota E2E en fecha bloqueada',
    );
    await shot(page, 'nota-fecha-bloqueada-1440', false);
    await note.getByRole('button', { name: 'Cancelar' }).click();
    await expect(note).toBeHidden();

    // Se retira desde la interfaz con su propia confirmación
    await page.goto('/accounting/periods');
    await lockCard.getByRole('textbox', { name: /^Motivo/ }).fill('Fin de la prueba E2E fase 5');
    await lockCard.getByRole('button', { name: 'Retirar bloqueo' }).click();
    const remove = page.getByRole('dialog', { name: '¿Retirar el bloqueo?' });
    await remove.getByRole('button', { name: 'Retirar bloqueo' }).click();
    await expect(lockCard.getByRole('status')).toContainText('Bloqueo retirado.');
  } finally {
    // Las demás pruebas registran documentos con fechas recientes: nunca dejar el bloqueo
    const lock = await call<{ current: { lockedThrough: string | null } | null }>(
      admin,
      'get',
      'accounting/document-lock',
    );
    if (lock.current?.lockedThrough) {
      await call(admin, 'post', 'accounting/document-lock', {
        lockedThrough: null,
        reason: 'Limpieza de la prueba E2E fase 5',
      });
    }
    await admin.dispose();
  }
});

test('inactivar un tercero nombra el registro y el efecto; un error de guardado queda en el diálogo', async ({
  page,
}) => {
  await page.goto(`/third-parties?q=${encodeURIComponent(fixtures.customer.documentNumber)}`);
  const row = page.getByRole('row', { name: new RegExp(fixtures.customer.name) }).first();
  await expect(row).toBeVisible();

  // Error de guardado simulado en la red: la confirmación lo muestra y deja reintentar o cancelar
  await page.route('**/api/v1/third-parties/*/deactivate', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Error interno al guardar el tercero.' }),
    }),
  );
  const deactivate = row.getByRole('button', { name: `Inactivar ${fixtures.customer.name}` });
  await deactivate.click();
  const confirm = page.getByRole('dialog', { name: '¿Inactivar el tercero?' });
  await expect(confirm.getByTestId('confirm-subject')).toContainText(fixtures.customer.name);
  await expect(confirm.getByTestId('confirm-effects')).toContainText(
    'Sus documentos, saldos e historial se conservan.',
  );
  // En una acción destructiva el foco empieza en Cancelar
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Inactivar tercero' }).click();
  await expect(confirm.getByRole('alert')).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Inactivar tercero' })).toBeEnabled();
  await shot(page, 'error-guardado-tercero-1440', false);
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirm).toBeHidden();
  await page.unroute('**/api/v1/third-parties/*/deactivate');
  // Nada cambió: el cliente sigue activo y el foco vuelve al botón que abrió el diálogo
  await expect(deactivate).toBeVisible();
  await expect(deactivate).toBeFocused();
});

test('ajuste de inventario desde la interfaz: confirma su impacto y anuncia el resultado', async ({
  page,
}) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Gasa ajuste E2E',
    basePrice: 800,
    lots: [{ suffix: 'AJU', daysToExpire: 300, quantity: 10 }],
  });
  const lotNumber = product.lots[0].lotNumber;
  const purposes = await call<Array<{ purpose: string; accountId: string | null }>>(
    admin,
    'get',
    'accounting/purposes',
  );
  const surplusBefore = purposes.find((p) => p.purpose === 'INVENTORY_SURPLUS')?.accountId ?? null;
  try {
    await page.goto('/inventory/lots');
    await page.getByLabel('Número de Lote').fill(lotNumber);
    await expect(page.getByRole('cell', { name: lotNumber }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Ajuste Manual' }).click();
    const dialog = page.getByRole('dialog', { name: /Ajuste Manual de Inventario/ });
    await dialog.getByRole('combobox', { name: /^Producto/ }).click();
    await page.getByRole('option', { name: new RegExp(product.code) }).click();
    await dialog.getByRole('combobox', { name: /Lote Específico/ }).click();
    await page.getByRole('option', { name: new RegExp(lotNumber) }).click();
    await dialog.getByLabel(/Cantidad a Ajustar/).fill('2');
    await dialog.getByLabel(/Motivo Justificado/).fill('Sobrante en conteo E2E');
    await dialog.getByRole('button', { name: 'Revisar y Confirmar' }).click();
    const confirm = page.getByRole('dialog', { name: 'Confirmar Ajuste en Kardex' });
    await expect(confirm).toBeVisible();

    // Sin la cuenta de sobrantes configurada el servidor rechaza el ajuste: el error queda en la
    // confirmación y nada cambia
    if (!surplusBefore) {
      await confirm.getByRole('button', { name: 'Asentar Ajuste' }).click();
      await expect(confirm.getByRole('alert')).toContainText(
        '«Sobrantes de inventario» (INVENTORY_SURPLUS)',
      );
      await shot(page, 'ajuste-inventario-error-1440', false);
      const accounts = await call<
        Array<{ id: string; type: string; allowsMovement: boolean; isActive: boolean }>
      >(admin, 'get', 'accounts');
      const income = accounts.find((a) => a.type === 'INCOME' && a.allowsMovement && a.isActive)!;
      await call(admin, 'put', 'accounting/purposes/INVENTORY_SURPLUS', { accountId: income.id });
    }

    // Reintento desde el mismo diálogo (misma clave de idempotencia): se asienta una sola vez
    await confirm.getByRole('button', { name: 'Asentar Ajuste' }).click();
    await expect(page.getByRole('status')).toContainText('Ajuste asentado');
    await expect(page.getByRole('cell', { name: '12 UNIDAD' }).first()).toBeVisible();
    await shot(page, 'ajuste-inventario-exito-1440', false);
  } finally {
    if (!surplusBefore) {
      await call(admin, 'put', 'accounting/purposes/INVENTORY_SURPLUS', { accountId: null });
    }
    await admin.dispose();
  }
});

const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1366', width: 1366, height: 768 },
  { name: '360', width: 360, height: 780 },
];

const SCREENS: Array<[string, string]> = [
  ['ventas', '/sales'],
  ['libro-diario', '/accounting/journal'],
  ['periodos', '/accounting/periods'],
  ['recibos-de-caja', '/treasury/receipts'],
  ['lotes', '/inventory/lots'],
  ['reportes', '/reports'],
  ['empresa', '/company'],
  ['usuarios', '/users'],
];

test('escritorio, portátil y ventana estrecha: sin desborde de página y tablas con desplazamiento propio', async ({
  page,
}) => {
  test.setTimeout(180_000);
  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const [name, url] of SCREENS) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const tables = [...document.querySelectorAll('.MuiTableContainer-root')].map((el) => ({
          scrolls: el.scrollWidth > el.clientWidth,
          overflowX: getComputedStyle(el).overflowX,
          fits: el.getBoundingClientRect().right <= doc.clientWidth + 1,
        }));
        return { page: doc.scrollWidth - doc.clientWidth, tables };
      });
      // La página no se desplaza a lo ancho; una tabla más ancha que la ventana se desplaza
      // dentro de su contenedor, que cabe en la ventana
      expect(overflow.page, `${name} @${size.name}`).toBeLessThanOrEqual(1);
      for (const table of overflow.tables) {
        expect(table.fits, `${name} @${size.name}`).toBe(true);
        if (table.scrolls) expect(['auto', 'scroll']).toContain(table.overflowX);
      }
      await shot(page, `${name}-${size.name}`, false);
    }
  }
});

test('estados de carga fallida y vacío se explican con una acción clara', async ({ page }) => {
  // Error al cargar: la lista lo dice y ofrece reintentar
  await page.route('**/api/v1/journal-entries?*', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Servicio no disponible.' }),
    }),
  );
  await page.goto('/accounting/journal');
  await expect(page.getByRole('alert')).toContainText('No se pudieron cargar los asientos');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await shot(page, 'error-carga-libro-diario-1440', false);
  await page.unroute('**/api/v1/journal-entries?*');

  // Vacío: un filtro sin resultados lo indica en lugar de una tabla en blanco
  await page.goto('/treasury/receipts?q=SIN-RESULTADOS-E2E');
  await expect(page.getByText(/No hay|Sin resultados|No se encontr/i).first()).toBeVisible();
  await shot(page, 'vacio-recibos-1440', false);
});
