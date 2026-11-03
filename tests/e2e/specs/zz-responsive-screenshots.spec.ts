import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  adminStateFile,
  apiAs,
  confirmSaleViaApi,
  createStockedProduct,
  loadFixtures,
} from '../support/api';

/**
 * Capturas de revisión responsive (correcciones del cliente, 2026-11-02). Solo corre con
 * RESPONSIVE_SHOTS=antes|despues y guarda cada pantalla en los cuatro anchos en
 * docs/responsive/<fase>/<ancho>/<pantalla>.jpg. Va al final de la corrida para que las
 * tablas tengan los datos que dejaron las demás pruebas.
 */
const phase = process.env.RESPONSIVE_SHOTS;
const outRoot = path.resolve(__dirname, '../../../docs/responsive');

const WIDTHS = [
  { width: 360, height: 780 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

const SCREENS: Array<[string, string]> = [
  ['inicio', '/'],
  ['pos', '/pos'],
  ['ventas', '/sales'],
  ['productos', '/products'],
  ['categorias', '/categories'],
  ['unidades', '/units-of-measure'],
  ['lotes', '/inventory/lots'],
  ['movimientos-inventario', '/inventory/movements'],
  ['compras', '/purchases'],
  ['recibir-compra', '/purchases/receive'],
  ['clientes', '/customers'],
  ['proveedores', '/suppliers'],
  ['terceros', '/third-parties'],
  ['cuentas-por-cobrar', '/receivables'],
  ['cuentas-por-pagar', '/payables'],
  ['caja', '/cash'],
  ['bancos', '/treasury/bank-accounts'],
  ['recibos-de-caja', '/treasury/receipts'],
  ['comprobantes-de-egreso', '/treasury/disbursements'],
  ['gastos', '/expenses'],
  ['alertas', '/alerts'],
  ['reportes', '/reports'],
  ['reportes-tributarios', '/tax-reports'],
  ['catalogo-tributario', '/tax-catalog'],
  ['empresa', '/company'],
  ['usuarios', '/users'],
  ['auditoria', '/audit'],
  ['respaldos', '/backups'],
  ['plan-de-cuentas', '/accounting/accounts'],
  ['mapeo-contable', '/accounting/purposes'],
  ['importar-puc', '/accounting/import'],
  ['asistente-contable', '/accounting/setup'],
  ['libro-diario', '/accounting/journal'],
  ['libros-oficiales', '/accounting/books'],
  ['balance-de-prueba', '/accounting/trial-balance'],
  ['balance-general', '/accounting/balance-sheet'],
  ['estado-de-resultados', '/accounting/income-statement'],
  ['consulta-contable', '/accounting/lookup'],
  ['conciliacion', '/accounting/reconciliation'],
  ['periodos-fiscales', '/accounting/periods'],
  ['auditoria-contable', '/accounting/audit'],
];

test.use({ storageState: adminStateFile });
test.describe.configure({ mode: 'serial' });

test.skip(!phase, 'Solo con RESPONSIVE_SHOTS=antes|despues');

test('datos de ejemplo para las capturas', async () => {
  const fixtures = loadFixtures();
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Ibuprofeno 400 mg capturas',
    basePrice: 1200,
    lots: [{ suffix: 'R', daysToExpire: 40, quantity: 60 }],
  });
  await confirmSaleViaApi(admin, {
    customerId: fixtures.customer.id,
    paymentMethod: 'CREDITO',
    items: [{ productId: product.id, quantityCommercial: 3 }],
  });
  await admin.dispose();
});

for (const size of WIDTHS) {
  test(`capturas a ${size.width}px`, async ({ page }) => {
    test.setTimeout(10 * 60_000);
    await page.setViewportSize(size);
    const dir = path.join(outRoot, phase!, String(size.width));
    mkdirSync(dir, { recursive: true });
    const report: Record<string, unknown> = {};
    for (const [name, url] of SCREENS) {
      await page.goto(url);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(400);
      await expect(page.locator('body')).toBeVisible();
      await page.screenshot({
        path: path.join(dir, `${name}.jpg`),
        fullPage: true,
        type: 'jpeg',
        quality: 55,
      });
      report[name] = await page.evaluate(() => {
        const text = (el: Element) => (el.textContent ?? '').trim().slice(0, 40);
        // Botones cuyo texto no cabe: desbordado, cortado o pegado al borde (menos de 6 px de relleno)
        const buttons = Array.from(document.querySelectorAll('main .MuiButton-root'))
          .filter((el) => {
            const b = el as HTMLElement;
            if (b.offsetParent === null || !text(b)) return false;
            if (b.scrollWidth > b.clientWidth + 1) return true;
            const range = document.createRange();
            range.selectNodeContents(b);
            const inner = range.getBoundingClientRect();
            const box = b.getBoundingClientRect();
            return inner.left - box.left < 6 || box.right - inner.right < 6;
          })
          .map(text);
        // Elementos más anchos que su contenedor sin un scroll horizontal propio que los contenga
        const main = document.querySelector('main');
        const clipped: string[] = [];
        if (main) {
          const limit = main.getBoundingClientRect().right + 1;
          for (const el of Array.from(main.querySelectorAll('*'))) {
            const r = (el as HTMLElement).getBoundingClientRect();
            if (r.width === 0 || r.right <= limit) continue;
            let scrolled = false;
            for (let a = el.parentElement; a && a !== main; a = a.parentElement) {
              const o = getComputedStyle(a).overflowX;
              if ((o === 'auto' || o === 'scroll') && a.getBoundingClientRect().right <= limit) {
                scrolled = true;
                break;
              }
            }
            if (!scrolled)
              clipped.push(
                `${el.tagName.toLowerCase()}${(el as HTMLElement).className ? '.' + String((el as HTMLElement).className).split(' ')[0] : ''}: ${text(el)}`,
              );
          }
        }
        return {
          pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
          buttons,
          clipped: clipped.slice(0, 8),
        };
      });
    }
    writeFileSync(path.join(dir, 'reporte.json'), JSON.stringify(report, null, 2));
  });
}
