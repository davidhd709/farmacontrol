/**
 * Utilidad para exportación a CSV conforme a RFC 4180 con soporte para UTF-8 BOM
 * para visualización impecable en Microsoft Excel y procesadores de texto en español.
 */
export function formatValueForCsv(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // Si contiene comas, saltos de línea o comillas, se escapan comillas y se envuelve entre comillas
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CsvColumn<T> {
  header: string;
  accessor: (item: T) => unknown;
}

export function generateCsv<T>(columns: CsvColumn<T>[], data: T[]): string {
  const BOM = '\uFEFF'; // UTF-8 Byte Order Mark para compatibilidad nativa con Excel
  const headers = columns.map((col) => formatValueForCsv(col.header)).join(',');
  const rows = data.map((row) =>
    columns.map((col) => formatValueForCsv(col.accessor(row))).join(','),
  );
  return BOM + [headers, ...rows].join('\r\n');
}
