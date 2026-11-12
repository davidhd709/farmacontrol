/**
 * Utilidades para impresión y exportación de documentos oficiales en FarmaControl.
 */

/**
 * Prepara el documento e invoca el cuadro de impresión del navegador.
 * Modifica temporalmente el título de la pestaña para que el nombre de archivo
 * sugerido en "Guardar como PDF" coincida con el número del documento.
 */
export function printDocument(documentTitle: string): void {
  const previousTitle = document.title;
  const sanitizedTitle = documentTitle.replace(/[/\\?%*:|"<>]/g, '-').trim();
  document.title = sanitizedTitle;

  window.print();

  setTimeout(() => {
    document.title = previousTitle;
  }, 1200);
}

/**
 * Descarga o imprime en formato PDF según soporte del navegador.
 */
export function downloadDocumentPdf(documentTitle: string): void {
  printDocument(`${documentTitle}_PDF`);
}

/**
 * Formatea un valor numérico a Pesos Colombianos (COP).
 */
export function formatCurrencyCop(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

