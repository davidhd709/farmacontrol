import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  AccountImportPreviewDto,
  AccountImportRowDto,
  ACCOUNT_TYPES,
  ACCOUNTING_PURPOSES,
  AccountType,
  AccountingPurpose,
} from '@farmacia/contracts';
import { AccountingValidationError } from '../domain/accounting-rules';

const REQUIRED_STANDARD_HEADERS = [
  'Código',
  'Nombre',
  'Tipo',
  'Código Padre',
  'Permite Movimiento',
  'Estado',
];
const ALL_HEADERS = [...REQUIRED_STANDARD_HEADERS, 'Propósito Contable'];

const MAX_ZIP_ENTRIES = 64;
const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_ENTRY_BYTES = 15 * 1024 * 1024;

/** Mapeo predeterminado de propósitos operativos para la farmacia (cuentas imputables terminales) */
const PHARMACY_DEFAULT_PURPOSES: Record<string, AccountingPurpose> = {
  '11050501': 'CASH', // Caja general
  '11200501': 'BANK', // Bancolombia Cta Aho 68095832443
  '13050501': 'CUSTOMERS', // Deudores nacionales
  '220501': 'SUPPLIERS', // Proveedores nacionales
  '1435': 'INVENTORY', // Mercancías no fabricadas por la empresa
  '413538': 'SALES_TAXED', // Venta productos farmacéuticos y medicinales
  '413595': 'SALES_EXCLUDED', // Venta de otros productos
  '613538': 'COST_OF_SALES', // Costo de ventas farmacéuticos
  '24080101': 'VAT_OUTPUT', // IVA generado ventas 19%
  '24080201': 'VAT_INPUT', // IVA compras 19%
  '13551801': 'SIMPLE_TAX_ADVANCE', // Retención ICA / Anticipo impuestos
  '417507': 'SALES_RETURNS', // Devoluciones en ventas
  '417506': 'SALES_DISCOUNTS', // Descuentos condicionados
  '3130': 'CAPITAL', // Capital de personas naturales
  '360505': 'CURRENT_YEAR_RESULT', // Utilidad del ejercicio
};

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

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.toUpperCase().trim();
  if (['SI', 'SÍ', 'TRUE', '1', 'ACTIVO', 'ACTIVA'].includes(normalized)) return true;
  if (['NO', 'FALSE', '0', 'INACTIVO', 'INACTIVA'].includes(normalized)) return false;
  return null;
}

function inferAccountType(code: string, rawType?: string): AccountType | null {
  const firstDigit = code.trim().charAt(0);
  switch (firstDigit) {
    case '1':
      return 'ASSET';
    case '2':
      return 'LIABILITY';
    case '3':
      return 'EQUITY';
    case '4':
      return 'INCOME';
    case '5':
      return 'EXPENSE';
    case '6':
    case '7':
      return 'COST';
    case '8':
      return 'ORDER_DEBTOR';
    case '9':
      return 'ORDER_CREDITOR';
    default: {
      if (rawType) {
        const norm = rawType.toUpperCase().trim();
        if (norm.includes('ACTIVO') || norm.includes('CAJA') || norm.includes('BANCO'))
          return 'ASSET';
        if (norm.includes('PASIVO')) return 'LIABILITY';
        if (norm.includes('PATRIMONIO')) return 'EQUITY';
        if (norm.includes('INGRESO') || norm.includes('VENTA')) return 'INCOME';
        if (norm.includes('GASTO')) return 'EXPENSE';
        if (norm.includes('COSTO')) return 'COST';
      }
      return null;
    }
  }
}

function findCanonicalParent(code: string, allCodes: Set<string>): string | null {
  for (let len = code.length - 1; len >= 1; len--) {
    const candidate = code.slice(0, len);
    if (allCodes.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function parseAccountWorkbook(
  buffer: Buffer,
): Promise<{ hash: string; rows: AccountImportRowDto[] }> {
  if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024)
    throw new AccountingValidationError('El archivo debe ser XLSX y no exceder 5 MB.');
  preflightZip(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new AccountingValidationError('Archivo XLSX inválido.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AccountingValidationError('El archivo no contiene hojas.');

  const rawHeaders = Array.from({ length: sheet.columnCount }, (_, index) =>
    cellText(sheet.getRow(1).getCell(index + 1).value),
  );
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  // Detectar formato contadora vs estándar
  const isContadora =
    normalizedHeaders.includes('codigo') &&
    (normalizedHeaders.includes('nombre de la cuenta') ||
      normalizedHeaders.includes('subcuenta de') ||
      normalizedHeaders.includes('tipo de cuenta'));

  if (!isContadora) {
    for (const header of REQUIRED_STANDARD_HEADERS) {
      if (!rawHeaders.includes(header))
        throw new AccountingValidationError(`Falta la columna ${header}.`);
    }
  }

  if (sheet.rowCount > 10001)
    throw new AccountingValidationError('Máximo 10000 cuentas por archivo.');

  const getCellVal = (row: ExcelJS.Row, targetHeaderNorm: string): string => {
    const idx = normalizedHeaders.indexOf(targetHeaderNorm);
    if (idx < 0) return '';
    return cellText(row.getCell(idx + 1).value);
  };

  const rows: AccountImportRowDto[] = [];

  if (isContadora) {
    interface RawRowItem {
      rowNum: number;
      code: string;
      name: string;
      parentCodeRaw: string | null;
      typeRaw: string;
    }
    const rawItems: RawRowItem[] = [];

    for (let n = 2; n <= sheet.rowCount; n++) {
      const source = sheet.getRow(n);
      if (!source.hasValues) continue;

      const code = getCellVal(source, 'codigo');
      if (!code) continue;

      const name =
        getCellVal(source, 'nombre de la cuenta') ||
        getCellVal(source, 'nombre de cuenta') ||
        getCellVal(source, 'nombre');

      const parentCodeRaw =
        getCellVal(source, 'subcuenta de') ||
        getCellVal(source, 'subcuenta') ||
        getCellVal(source, 'codigo padre') ||
        null;

      const typeRaw = getCellVal(source, 'tipo de cuenta') || getCellVal(source, 'tipo');

      rawItems.push({
        rowNum: n,
        code,
        name,
        parentCodeRaw: parentCodeRaw?.trim() ? parentCodeRaw.trim() : null,
        typeRaw,
      });
    }

    const allCodes = new Set(rawItems.map((item) => item.code));

    // Determinar cuentas padre canónicas e identificar jerarquías
    const resolvedParents = new Map<string, string | null>();
    const rowWarnings = new Map<string, string[]>();

    for (const item of rawItems) {
      const warnings: string[] = [];
      let finalParent: string | null = null;

      if (item.code.length === 1) {
        finalParent = null;
      } else if (
        item.parentCodeRaw &&
        allCodes.has(item.parentCodeRaw) &&
        item.code.startsWith(item.parentCodeRaw)
      ) {
        finalParent = item.parentCodeRaw;
      } else {
        const canonical = findCanonicalParent(item.code, allCodes);
        finalParent = canonical;
        if (item.parentCodeRaw && item.parentCodeRaw !== canonical) {
          warnings.push(
            `Cuenta padre ajustada automáticamente a ${canonical} por jerarquía del código (en archivo: ${item.parentCodeRaw}).`,
          );
        }
      }
      resolvedParents.set(item.code, finalParent);
      rowWarnings.set(item.code, warnings);
    }

    // Un código es padre si algún otro código lo referencia como padre
    const usedAsParentCodes = new Set<string>();
    for (const parent of resolvedParents.values()) {
      if (parent) usedAsParentCodes.add(parent);
    }

    for (const item of rawItems) {
      const errors: string[] = [];
      const warnings = rowWarnings.get(item.code) ?? [];
      const parentCode = resolvedParents.get(item.code) ?? null;
      const allowsMovement = !usedAsParentCodes.has(item.code);
      const isActive = true;
      const inferredType = inferAccountType(item.code, item.typeRaw);

      if (!/^[0-9A-Za-z.-]{1,32}$/.test(item.code)) errors.push('Código inválido o vacío.');
      if (!item.name || item.name.length > 255)
        errors.push('Nombre requerido (máximo 255 caracteres).');
      if (!inferredType || !ACCOUNT_TYPES.includes(inferredType))
        errors.push('Tipo contable inválido.');

      const defaultPurpose =
        allowsMovement && PHARMACY_DEFAULT_PURPOSES[item.code]
          ? PHARMACY_DEFAULT_PURPOSES[item.code]
          : null;

      rows.push({
        row: item.rowNum,
        code: item.code,
        name: item.name,
        type: inferredType ?? 'ASSET',
        parentCode,
        allowsMovement,
        isActive,
        purpose: defaultPurpose,
        errors,
        warnings,
      });
    }
  } else {
    // Formato estándar del sistema
    const value = (row: ExcelJS.Row, header: string) => {
      const idx = rawHeaders.indexOf(header);
      return idx >= 0 ? cellText(row.getCell(idx + 1).value) : '';
    };

    for (let n = 2; n <= sheet.rowCount; n++) {
      const source = sheet.getRow(n);
      if (!source.hasValues) continue;
      const code = value(source, 'Código');
      const name = value(source, 'Nombre');
      const type = value(source, 'Tipo').toUpperCase();
      const parentCode = value(source, 'Código Padre') || null;
      const allowsMovement = parseBoolean(value(source, 'Permite Movimiento'));
      const isActive = parseBoolean(value(source, 'Estado'));
      const purpose = rawHeaders.includes('Propósito Contable')
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
