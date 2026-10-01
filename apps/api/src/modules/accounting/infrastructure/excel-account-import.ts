import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  AccountImportPreviewDto,
  AccountImportRowDto,
  ACCOUNT_TYPES,
  ACCOUNTING_PURPOSES,
} from '@farmacia/contracts';
import { AccountingValidationError } from '../domain/accounting-rules';

const REQUIRED_HEADERS = [
  'Código',
  'Nombre',
  'Tipo',
  'Código Padre',
  'Permite Movimiento',
  'Estado',
];
const ALL_HEADERS = [...REQUIRED_HEADERS, 'Propósito Contable'];

const MAX_ZIP_ENTRIES = 64;
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_BYTES = 12 * 1024 * 1024;

/** Rechaza ZIPs con expansión excesiva antes de que ExcelJS descomprima el XLSX. */
function preflightZip(buffer: Buffer): void {
  const invalid = () =>
    new AccountingValidationError('Estructura XLSX inválida o demasiado grande.');
  let end = -1;
  const first = Math.max(0, buffer.length - 22 - 65535);
  for (let offset = buffer.length - 22; offset >= first; offset--) {
    if (
      buffer.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw invalid();
  if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) throw invalid();
  const count = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  const centralOffset = buffer.readUInt32LE(end + 16);
  if (
    count === 0 ||
    count > MAX_ZIP_ENTRIES ||
    centralSize === 0 ||
    centralOffset + centralSize > end
  )
    throw invalid();
  let position = centralOffset;
  let expanded = 0;
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || buffer.readUInt32LE(position) !== 0x02014b50) throw invalid();
    const flags = buffer.readUInt16LE(position + 8);
    const compressed = buffer.readUInt32LE(position + 20);
    const uncompressed = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const localOffset = buffer.readUInt32LE(position + 42);
    if (
      (flags & 1) !== 0 ||
      compressed === 0xffffffff ||
      uncompressed === 0xffffffff ||
      localOffset === 0xffffffff ||
      localOffset >= centralOffset
    )
      throw invalid();
    if (uncompressed > MAX_ENTRY_BYTES) throw invalid();
    expanded += uncompressed;
    if (expanded > MAX_UNCOMPRESSED_BYTES) throw invalid();
    position += 46 + nameLength + extraLength + commentLength;
    if (position > centralOffset + centralSize) throw invalid();
  }
  if (position !== centralOffset + centralSize) throw invalid();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text).trim();
    if ('result' in value) return String(value.result ?? '').trim();
    return '';
  }
  return String(value).trim();
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.toUpperCase();
  if (['SI', 'SÍ', 'TRUE', '1', 'ACTIVO', 'ACTIVA'].includes(normalized)) return true;
  if (['NO', 'FALSE', '0', 'INACTIVO', 'INACTIVA'].includes(normalized)) return false;
  return null;
}

export async function parseAccountWorkbook(
  buffer: Buffer,
): Promise<{ hash: string; rows: AccountImportRowDto[] }> {
  if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024)
    throw new AccountingValidationError('El archivo debe ser XLSX y no exceder 2 MB.');
  preflightZip(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new AccountingValidationError('Archivo XLSX inválido.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AccountingValidationError('El archivo no contiene hojas.');
  const headers = Array.from({ length: sheet.columnCount }, (_, index) =>
    cellText(sheet.getRow(1).getCell(index + 1).value),
  );
  for (const header of REQUIRED_HEADERS)
    if (!headers.includes(header))
      throw new AccountingValidationError(`Falta la columna ${header}.`);
  if (sheet.rowCount > 5001)
    throw new AccountingValidationError('Máximo 5000 cuentas por archivo.');
  const value = (row: ExcelJS.Row, header: string) =>
    cellText(row.getCell(headers.indexOf(header) + 1).value);
  const rows: AccountImportRowDto[] = [];
  for (let n = 2; n <= sheet.rowCount; n++) {
    const source = sheet.getRow(n);
    if (!source.hasValues) continue;
    const code = value(source, 'Código');
    const name = value(source, 'Nombre');
    const type = value(source, 'Tipo').toUpperCase();
    const parentCode = value(source, 'Código Padre') || null;
    const allowsMovement = parseBoolean(value(source, 'Permite Movimiento'));
    const isActive = parseBoolean(value(source, 'Estado'));
    const purpose = headers.includes('Propósito Contable')
      ? value(source, 'Propósito Contable').toUpperCase() || null
      : null;
    const errors: string[] = [];
    if (!/^[0-9A-Za-z.-]{1,32}$/.test(code)) errors.push('Código inválido o vacío.');
    if (!name || name.length > 255) errors.push('Nombre requerido (máximo 255 caracteres).');
    if (!ACCOUNT_TYPES.includes(type as (typeof ACCOUNT_TYPES)[number]))
      errors.push('Tipo contable inválido.');
    if (allowsMovement === null) errors.push('Permite Movimiento inválido.');
    if (isActive === null) errors.push('Estado inválido.');
    if (purpose && !ACCOUNTING_PURPOSES.includes(purpose as (typeof ACCOUNTING_PURPOSES)[number]))
      errors.push('Propósito contable inválido.');
    rows.push({
      row: n,
      code,
      name,
      type,
      parentCode,
      allowsMovement,
      isActive,
      purpose,
      errors,
      warnings: [],
    });
  }
  if (!rows.length) throw new AccountingValidationError('El archivo no contiene cuentas.');
  return { hash: createHash('sha256').update(buffer).digest('hex'), rows };
}

export async function accountTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Plan de cuentas');
  sheet.addRow(ALL_HEADERS);
  sheet.columns.forEach((column) => {
    column.width = 25;
  });
  sheet.getRow(1).font = { bold: true };
  const result = await workbook.xlsx.writeBuffer();
  return Buffer.from(result);
}

export function previewDto(hash: string, rows: AccountImportRowDto[]): AccountImportPreviewDto {
  return {
    previewHash: hash,
    validCount: rows.filter((row) => !row.errors.length).length,
    errorCount: rows.filter((row) => row.errors.length).length,
    warningCount: rows.reduce((count, row) => count + row.warnings.length, 0),
    rows,
  };
}
