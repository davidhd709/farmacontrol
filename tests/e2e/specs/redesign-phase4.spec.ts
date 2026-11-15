import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  adminStateFile,
  apiAs,
  businessDay,
  call,
  confirmSaleViaApi,
  createStockedProduct,
  loadFixtures,
  uniqueCode,
} from '../support/api';

/**
 * Criterio de aceptación de la fase 4 del rediseño (2026-11-14): cada documento dice qué
 * acciones admite y por qué; una corrección conserva saldos y vínculos; la impresión y el PDF de
 * cada tipo llevan membrete, consecutivo, fecha, tercero, detalle, totales y estado, y un
 * documento largo reparte sus filas en varias páginas repitiendo el encabezado de la tabla.
 * PDFs y capturas en docs/rediseno/fase-4/, con datos creados por la corrida.
 */
const fixtures = loadFixtures();
const out = path.resolve(__dirname, '../../../docs/rediseno/fase-4');
test.use({ storageState: adminStateFile });

async function shot(page: Page, name: string) {
  mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
}

/** PDF tal como lo imprime el navegador (medio print) y su texto por página */
async function pdfOf(page: Page, name: string) {
  mkdirSync(out, { recursive: true });
  const file = path.join(out, `${name}.pdf`);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  const info = execFileSync('pdfinfo', [file]).toString();
  const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
  const pageText = (n: number) =>
    execFileSync('pdftotext', ['-layout', '-f', String(n), '-l', String(n), file, '-']).toString();
  const text = execFileSync('pdftotext', ['-layout', file, '-']).toString();
  return { pages, text, pageText, size: /Page size:\s+([^\n]+)/.exec(info)?.[1] ?? '' };
}

/** El membrete sale de la empresa configurada; la corrida la configura si falta */
async function ensureCompany(admin: APIRequestContext) {
  const current = await call<{ company: { legalName: string } | null }>(
    admin,
    'get',
    'company/letterhead',
  );
  if (current.company) return current.company.legalName;
  await call(admin, 'post', 'company/setup', {
    legalName: 'Droguería Rediseño E2E S.A.S.',
    tradeName: 'Rediseño E2E',
    taxId: '900123456',
    taxIdCheckDigit: '8',
    sectorProfile: 'PHARMACY',
    municipalityCode: '05001',
    address: 'Calle 10 # 20-30',
    branch: { code: 'PRINCIPAL', name: 'Sede principal', municipalityCode: '05001' },
  });
  return 'Droguería Rediseño E2E S.A.S.';
}

async function receivableOf(admin: APIRequestContext, saleId: string) {
  const list = await call<{ items: { id: string; saleId: string; balance: string | number }[] }>(
    admin,
    'get',
    `receivables?customerId=${fixtures.customer.id}`,
  );
  return list.items.find((item) => item.saleId === saleId)!;
}

test('corregir un recibo de abono desde su detalle conserva saldos y deja el original enlazado', async ({
  page,
}) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const legalName = await ensureCompany(admin);
  const product = await createStockedProduct(admin, fixtures, {
    name: 'Rediseño corrección',
    basePrice: 800,
    lots: [{ suffix: 'A', daysToExpire: 300, quantity: 30 }],
  });
  const sale = await confirmSaleViaApi(admin, {
    customerId: fixtures.customer.id,
    paymentMethod: 'CREDITO',
    items: [{ productId: product.id, quantityCommercial: 10 }],
  });
  const receivable = await receivableOf(admin, sale.id);
  const receipt = await call<{ id: string; documentNumber: string }>(
    admin,
    'post',
    'treasury/cash-receipts/collections',
    {
      kind: 'CARTERA',
      paymentMethod: 'EFECTIVO',
      concept: 'Abono rediseño F4',
      customerId: fixtures.customer.id,
      applications: [{ receivableId: receivable.id, amount: '3000.00' }],
    },
    { 'Idempotency-Key': randomUUID() },
  );
  expect(Number((await receivableOf(admin, sale.id)).balance)).toBe(5000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/treasury/receipts?q=${receipt.documentNumber}`);
  await page.getByRole('button', { name: receipt.documentNumber }).click();
  await expect(page.getByRole('button', { name: 'Corregir Documento' })).toBeVisible();
  await page.getByRole('button', { name: 'Corregir Documento' }).click();
  const correction = page.getByRole('dialog', { name: /Corregir Recibo de Caja/ });
  await correction.locator('table input').first().fill('2000');
  await page.getByRole('button', { name: 'Ajuste en valores aplicados' }).click();
  await shot(page, 'correccion-recibo-1440');
  await page.getByRole('button', { name: 'Corregir Documento' }).last().click();
  await page.getByRole('button', { name: 'Confirmar y Reemplazar' }).click();
  await expect(page.getByText(/Se emitió el reemplazo RC-\d+/)).toBeVisible();

  // Saldos: se reversó el abono de 3.000 y se aplicó el de 2.000
  expect(Number((await receivableOf(admin, sale.id)).balance)).toBe(6000);
  const original = await call<{ status: string; cancellationReason: string }>(
    admin,
    'get',
    `treasury/documents/${receipt.id}`,
  );
  expect(original.status).toBe('ANULADO');
  expect(original.cancellationReason).toMatch(
    /^Corregido con RC-\d+: Ajuste en valores aplicados$/,
  );

  // El original anulado: sin acciones, con el motivo, y su PDF lo marca anulado
  await page.goto(`/treasury/receipts?q=${receipt.documentNumber}`);
  await page.getByRole('button', { name: receipt.documentNumber }).click();
  await expect(page.getByTestId('treasury-actions-restriction')).toContainText(
    'Documento anulado: no admite cambios',
  );
  await expect(page.getByRole('button', { name: 'Corregir Documento' })).toHaveCount(0);
  await shot(page, 'recibo-anulado-1440');
  const pdf = await pdfOf(page, 'recibo-anulado');
  expect(pdf.pages).toBe(1);
  expect(pdf.text).toContain(legalName);
  expect(pdf.text).toContain(receipt.documentNumber);
  // El aviso usa espaciado entre letras: pdftotext lo extrae letra por letra
  expect(pdf.text.replace(/\s+/g, '')).toContain('DOCUMENTOANULADO');
  expect(pdf.text).toContain('Corregido con RC-');
  expect(pdf.text).toContain(fixtures.customer.name);
  // La fecha calendario del documento, sin correrse un día por la zona horaria
  const [y, m, d] = businessDay(0).split('-');
  expect(pdf.text).toContain(`Fecha: ${d}/${m}/${y}`);
  expect(pdf.text).not.toMatch(/900\.000\.000-1|contacto@farmacontrol\.com/);
  // Lo que no se imprime: avisos y botones de la pantalla
  expect(pdf.text).not.toContain('Documento anulado: no admite cambios');
  expect(pdf.text).not.toContain('Descargar PDF');
  await admin.dispose();
});

test('compra de varias páginas, su nota débito y un egreso automático: impresión y PDF', async ({
  page,
}) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const legalName = await ensureCompany(admin);
  const code = uniqueCode('F4');
  const product = await call<{ id: string }>(admin, 'post', 'products', {
    categoryId: fixtures.categoryId,
    code,
    name: `Rediseño impresión ${code}`,
    inventoryControlMode: 'LOT_EXPIRY',
    basePrice: 900,
    baseCost: 400,
  });
  // 45 líneas (un lote cada una): no caben en una hoja carta
  const invoice = uniqueCode('FAC');
  const purchase = await call<{ id: string; invoiceNumber: string; lines: { id: string }[] }>(
    admin,
    'post',
    'purchases/receive',
    {
      supplierId: fixtures.supplierId,
      invoiceNumber: invoice,
      purchaseDate: businessDay(0),
      lines: Array.from({ length: 45 }, (_, index) => ({
        productId: product.id,
        lotNumber: `${code}-L${String(index + 1).padStart(2, '0')}`,
        expirationDate: businessDay(400 + index),
        quantityCommercial: 2,
        unitCost: 400,
      })),
    },
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/purchases');
  await page
    .getByRole('row', { name: new RegExp(invoice) })
    .getByRole('button', { name: 'Ver Detalle' })
    .click();
  await page.getByRole('button', { name: 'Imprimir' }).click();
  const printable = page.getByRole('dialog');
  await expect(printable).toContainText('Comprobante de Recepción de Compra');
  await expect(printable).toContainText(legalName);
  const purchasePdf = await pdfOf(page, 'compra-varias-paginas');
  expect(purchasePdf.size).toMatch(/612 x 792/); // carta
  expect(purchasePdf.pages).toBeGreaterThan(1);
  expect(purchasePdf.pageText(1)).toContain(legalName);
  expect(purchasePdf.pageText(1)).toContain(invoice);
  // El encabezado de la tabla se repite en la segunda hoja y los totales cierran el documento
  expect(purchasePdf.pageText(2)).toMatch(/Producto/);
  expect(purchasePdf.pageText(purchasePdf.pages)).toContain('TOTAL COMPRA');
  // El último lote llega al PDF; el código puede partirse en dos renglones de su celda y la
  // disposición de columnas varía entre versiones de pdftotext
  expect(purchasePdf.text).toMatch(/L45\b/);
  expect(purchasePdf.text).toContain('Recibida');
  await page.getByRole('button', { name: 'Cerrar' }).click();

  // Nota débito: se imprime desde el detalle de la compra
  await call(
    admin,
    'post',
    `purchases/${purchase.id}/debit-notes`,
    {
      purchaseId: purchase.id,
      reason: 'Devolución de prueba de impresión',
      items: [{ purchaseLineId: purchase.lines[0].id, quantityCommercial: 1 }],
    },
    { 'Idempotency-Key': randomUUID() },
  );
  await page
    .getByRole('row', { name: new RegExp(invoice) })
    .getByRole('button', { name: 'Ver Detalle' })
    .click();
  const notes = page.getByTestId('purchase-debit-notes');
  await expect(notes).toContainText(/ND-\d+/);
  await notes.getByRole('button', { name: /^Imprimir ND-/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Nota Débito a Proveedor');
  const notePdf = await pdfOf(page, 'nota-debito');
  expect(notePdf.pages).toBe(1);
  expect(notePdf.text).toContain(legalName);
  expect(notePdf.text).toMatch(/ND-\d+/);
  expect(notePdf.text).toContain(invoice);
  expect(notePdf.text).toContain('Devolución de prueba de impresión');
  await page.getByRole('button', { name: 'Cerrar' }).click();

  // Un egreso automático (reembolso de una devolución) solo se imprime y dice dónde se corrige
  const sold = await call<{ id: string; lines: { id: string }[] }>(
    admin,
    'post',
    'sales/confirm',
    { paymentMethod: 'EFECTIVO', items: [{ productId: product.id, quantityCommercial: 1 }] },
    { 'Idempotency-Key': randomUUID() },
  );
  const note = await call<{ creditNoteNumber: string }>(
    admin,
    'post',
    `sales/${sold.id}/credit-notes`,
    {
      reason: 'Devolución para el egreso automático',
      refundMethod: 'EFECTIVO',
      restock: true,
      items: [{ saleLineId: sold.lines[0].id, quantityCommercial: 1 }],
    },
    { 'Idempotency-Key': randomUUID() },
  );
  const disbursements = await call<{
    items: { documentNumber: string; referenceDocumentId: string | null; origin: string }[];
  }>(admin, 'get', 'treasury/documents?type=COMPROBANTE_EGRESO&pageSize=100');
  const automatic = disbursements.items.find(
    (doc) => doc.referenceDocumentId === note.creditNoteNumber,
  );
  expect(automatic?.origin).toBe('AUTOMATICO');
  await page.goto(`/treasury/disbursements?q=${automatic!.documentNumber}`);
  await page.getByRole('button', { name: automatic!.documentNumber }).click();
  const restriction = page.getByTestId('treasury-actions-restriction');
  await expect(restriction).toContainText(`Lo generó la nota crédito ${note.creditNoteNumber}`);
  const sourceLink = restriction.getByRole('link', {
    name: `Abrir la nota crédito ${note.creditNoteNumber}`,
  });
  await expect(sourceLink).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anular Documento' })).toHaveCount(0);
  await shot(page, 'egreso-automatico-1440');
  const disbursementPdf = await pdfOf(page, 'egreso-automatico');
  expect(disbursementPdf.pages).toBe(1);
  expect(disbursementPdf.text).toContain(
    `Emitido automáticamente por la nota crédito ${note.creditNoteNumber}`,
  );
  expect(disbursementPdf.text).toContain(legalName);

  // «Abrir la nota crédito» lleva al documento exacto, que se imprime con el mismo formato
  await sourceLink.click();
  await expect(page).toHaveURL(new RegExp(`/credit-notes\\?nota=${note.creditNoteNumber}`));
  const creditNoteDialog = page.getByRole('dialog');
  await expect(creditNoteDialog).toContainText(`Detalle de Nota Crédito ${note.creditNoteNumber}`);
  await expect(creditNoteDialog).toContainText(legalName);
  const creditNotePdf = await pdfOf(page, 'nota-credito');
  expect(creditNotePdf.size).toMatch(/612 x 792/);
  expect(creditNotePdf.pages).toBe(1);
  expect(creditNotePdf.text).toContain(legalName);
  expect(creditNotePdf.text).toContain(note.creditNoteNumber);
  expect(creditNotePdf.text).toContain('Devolución para el egreso automático');
  expect(creditNotePdf.text).not.toMatch(/900\.000\.000-1|contacto@farmacontrol\.com/);
  await admin.dispose();
});

test('causación de gasto y su asiento contable: impresión y PDF', async ({ page }) => {
  const admin = await apiAs(fixtures.admin.username, fixtures.admin.password);
  const legalName = await ensureCompany(admin);
  const code = uniqueCode('G4');
  const accounts = await call<
    { id: string; code: string; type: string; allowsMovement: boolean; isActive: boolean }[]
  >(admin, 'get', 'accounts');
  const expenseAccount = accounts.find(
    (account) => account.type === 'EXPENSE' && account.allowsMovement && account.isActive,
  );
  expect(expenseAccount, 'el plan de cuentas de E2E debe tener una cuenta de gasto').toBeTruthy();
  const category = await call<{ id: string }>(admin, 'post', 'expense-categories', {
    name: `Rediseño ${code}`,
    accountId: expenseAccount!.id,
  });
  const expense = await call<{ id: string; beneficiary: string }>(
    admin,
    'post',
    'expenses',
    {
      categoryId: category.id,
      description: `Mantenimiento nevera ${code}`,
      supplierId: fixtures.supplierId,
      documentNumber: code,
      amount: '125000.00',
      expenseDate: businessDay(0),
      paymentMethod: 'CREDITO',
    },
    { 'Idempotency-Key': randomUUID() },
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/expenses?gasto=${expense.id}`);
  await expect(page.getByRole('dialog')).toContainText('Detalle de Gasto e Historial de Pagos');
  await page.getByRole('dialog').getByRole('button', { name: 'Imprimir' }).click();
  const expenseDialog = page
    .getByRole('dialog')
    .filter({ hasText: 'Causación de Gasto Operativo' });
  await expect(expenseDialog).toContainText(legalName);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const expensePdf = await pdfOf(page, 'gasto');
  expect(expensePdf.size).toMatch(/612 x 792/);
  expect(expensePdf.pages).toBe(1);
  expect(expensePdf.text).toContain(legalName);
  expect(expensePdf.text).toContain(expense.beneficiary);
  // El proveedor no se repite entre paréntesis y el medio de pago sale en palabras
  expect(expensePdf.text).not.toContain(`(${expense.beneficiary})`);
  expect(expensePdf.text).toMatch(/Crédito/);
  expect(expensePdf.text).toContain(code);
  expect(expensePdf.text).toMatch(/125\.000,00/);
  await page.keyboard.press('Escape');

  // El asiento de la causación, buscado por su documento de origen en el Libro Diario
  await page.goto('/accounting/journal');
  await page.getByLabel('Buscar descripción o documento').fill(expense.id);
  const row = page.getByRole('row', { name: /125\.000,00/ }).first();
  await row.getByRole('button', { name: 'Imprimir' }).click();
  const entryDialog = page.getByRole('dialog');
  await expect(entryDialog).toContainText('Asiento del Libro Diario');
  await expect(entryDialog).toContainText(legalName);
  const entryPdf = await pdfOf(page, 'asiento-contable');
  expect(entryPdf.size).toMatch(/612 x 792/);
  expect(entryPdf.pages).toBe(1);
  expect(entryPdf.text).toContain(legalName);
  expect(entryPdf.text).toContain(expenseAccount!.code);
  // Origen en palabras, fecha legible y las dos columnas de valores completas dentro de la hoja
  expect(entryPdf.text).toContain(`Causación · ${code}`);
  expect(entryPdf.text).not.toMatch(/EXPENSE|\d{4}-\d{2}-\d{2}T/);
  expect(entryPdf.text).toMatch(/Débito\s+Crédito/);
  expect(entryPdf.text).toMatch(/125\.000,00/);
  await admin.dispose();
});
