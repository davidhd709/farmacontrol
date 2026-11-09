import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  INVENTORY_CONTROL_MODES,
  type InventoryControlMode,
  type ProductDto,
  type ProductImportPreviewDto,
  type ProductImportRowDto,
} from '@farmacia/contracts';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import type { AuditService } from '../../audit/application/services/audit.service';
import { sectorProfileRules } from '../../company/application/sector-profile.reader';

const MAX_ZIP_ENTRIES = 64;
const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_ENTRY_BYTES = 15 * 1024 * 1024;

/**
 * Preflight de seguridad anti-ZIP bomb antes de descomprimir el XLSX con ExcelJS.
 */
export function preflightZip(buffer: Buffer): void {
  const invalid = () =>
    new BadRequestException('Estructura XLSX inválida o archivo demasiado grande.');

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
  ) {
    throw invalid();
  }

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
    ) {
      throw invalid();
    }
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

function parseBooleanValue(value: string, defaultValue: boolean): boolean | null {
  const norm = value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!norm) return defaultValue;
  if (['SI', 'TRUE', '1', 'ACTIVO', 'ACTIVA'].includes(norm)) return true;
  if (['NO', 'FALSE', '0', 'INACTIVO', 'INACTIVA'].includes(norm)) return false;
  return null;
}

function parseNumericValue(value: string | number, label: string): { value: number; error?: string } {
  if (typeof value === 'number') {
    if (isNaN(value) || value < 0) return { value: 0, error: `${label} no puede ser negativo o inválido.` };
    return { value };
  }
  const clean = String(value)
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const num = parseFloat(clean);
  if (isNaN(num) || num < 0) {
    return { value: 0, error: `${label} debe ser un valor numérico mayor o igual a cero.` };
  }
  return { value: num };
}

/**
 * Normaliza y mapea el modo de control de inventario indicado en el archivo.
 */
function parseControlMode(raw: string, defaultMode: InventoryControlMode): { mode: InventoryControlMode; error?: string } {
  if (!raw.trim()) return { mode: defaultMode };
  const upper = raw.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['FEFO', 'LOTE_VENCIMIENTO', 'LOT_EXPIRY', 'LOTE Y VENCIMIENTO', 'LOTE Y VENCIMIENTO (FEFO)'].includes(upper)) {
    return { mode: 'LOT_EXPIRY' };
  }
  if (['SIMPLE', 'INVENTARIO SIMPLE', 'GENERAL'].includes(upper)) {
    return { mode: 'SIMPLE' };
  }
  if (['SERVICIO', 'SERVICE'].includes(upper)) {
    return { mode: 'SERVICE' };
  }
  if (['LOTE', 'LOT', 'SOLO LOTE'].includes(upper)) {
    return { mode: 'LOT' };
  }
  if (['SERIE', 'SERIAL', 'NUMERO DE SERIE'].includes(upper)) {
    return { mode: 'SERIAL' };
  }
  if (INVENTORY_CONTROL_MODES.includes(upper as InventoryControlMode)) {
    return { mode: upper as InventoryControlMode };
  }
  return {
    mode: defaultMode,
    error: `Modo de control "${raw}" no es válido. Opciones: ${INVENTORY_CONTROL_MODES.join(', ')}.`,
  };
}

interface ParsedRawRow {
  rowNumber: number;
  code: string;
  barcode: string | null;
  name: string;
  categoryRaw: string;
  genericName: string | null;
  concentration: string | null;
  sanitaryRegistry: string | null;
  manufacturer: string | null;
  description: string | null;
  baseUnit: string;
  basePriceRaw: string;
  baseCostRaw: string;
  controlModeRaw: string;
  prescriptionRequiredRaw: string;
  isActiveRaw: string;
}

/**
 * Lee y extrae filas del primer worksheet de un libro Excel.
 */
async function extractRowsFromWorkbook(buffer: Buffer): Promise<{ rows: ParsedRawRow[]; error?: string }> {
  preflightZip(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) {
    return { rows: [], error: 'El archivo Excel no contiene datos o la hoja está vacía.' };
  }

  // Identificar índices de columnas desde la cabecera (fila 1)
  const headerRow = worksheet.getRow(1);
  const colMap = new Map<string, number>();

  headerRow.eachCell((cell, colNumber) => {
    const text = normalizeHeader(cellText(cell.value));
    if (text) {
      colMap.set(text, colNumber);
    }
  });

  // Funciones para resolver columnas con nombres alternativos
  const findCol = (...names: string[]): number | undefined => {
    for (const name of names) {
      const norm = normalizeHeader(name);
      for (const [colName, colIdx] of colMap.entries()) {
        if (colName === norm || colName.includes(norm)) {
          return colIdx;
        }
      }
    }
    return undefined;
  };

  const colCode = findCol('codigo (sku)', 'codigo sku', 'sku', 'codigo');
  const colName = findCol('nombre comercial', 'nombre', 'producto', 'descripcion comercial');
  const colCategory = findCol('categoria', 'clasificacion');
  const colPrice = findCol('precio base', 'precio', 'precio de venta');
  const colBarcode = findCol('codigo de barras', 'codigo barras', 'barcode', 'barra');
  const colGeneric = findCol('principio activo', 'nombre generico', 'generico');
  const colConcentration = findCol('concentracion');
  const colSanitary = findCol('registro sanitario', 'registro invima', 'invima');
  const colManufacturer = findCol('laboratorio / fabricante', 'laboratorio', 'fabricante');
  const colDescription = findCol('descripcion');
  const colUnit = findCol('unidad base', 'unidad de medida', 'unidad');
  const colCost = findCol('costo base', 'costo', 'costo unitario');
  const colControlMode = findCol('control de inventario', 'modo de control', 'control inventario');
  const colPrescription = findCol('requiere formula medica', 'formula medica', 'receta medica');
  const colStatus = findCol('estado', 'activo');

  const missingColumns: string[] = [];
  if (!colCode) missingColumns.push('Código (SKU)');
  if (!colName) missingColumns.push('Nombre Comercial');
  if (!colCategory) missingColumns.push('Categoría');
  if (!colPrice) missingColumns.push('Precio Base');

  if (missingColumns.length > 0) {
    return {
      rows: [],
      error: `El archivo no contiene las columnas requeridas: ${missingColumns.join(', ')}.`,
    };
  }

  const rawRows: ParsedRawRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Encabezado

    const getVal = (col?: number): string => (col ? cellText(row.getCell(col).value) : '');

    const code = getVal(colCode);
    const name = getVal(colName);
    const categoryRaw = getVal(colCategory);
    const basePriceRaw = getVal(colPrice);

    // Si la fila está completamente en blanco, la ignoramos
    if (!code && !name && !categoryRaw && !basePriceRaw) return;

    rawRows.push({
      rowNumber,
      code,
      name,
      categoryRaw,
      basePriceRaw,
      barcode: getVal(colBarcode) || null,
      genericName: getVal(colGeneric) || null,
      concentration: getVal(colConcentration) || null,
      sanitaryRegistry: getVal(colSanitary) || null,
      manufacturer: getVal(colManufacturer) || null,
      description: getVal(colDescription) || null,
      baseUnit: getVal(colUnit) || 'UNIDAD',
      baseCostRaw: getVal(colCost) || '0',
      controlModeRaw: getVal(colControlMode),
      prescriptionRequiredRaw: getVal(colPrescription),
      isActiveRaw: getVal(colStatus),
    });
  });

  return { rows: rawRows };
}

/**
 * Valida la estructura del archivo y analiza duplicados y coherencia con la base de datos.
 */
export async function parseAndValidateProductWorkbook(
  buffer: Buffer,
  client: PrismaClient = prisma,
): Promise<ProductImportPreviewDto> {
  const previewHash = createHash('sha256').update(buffer).digest('hex');

  const { rows: rawRows, error: extractionError } = await extractRowsFromWorkbook(buffer);
  if (extractionError) {
    throw new BadRequestException(extractionError);
  }

  if (rawRows.length === 0) {
    throw new BadRequestException('El archivo no contiene filas de productos para importar.');
  }

  const { rules } = await sectorProfileRules(client);
  const defaultMode = rules.defaultControlMode;

  // Consultar categorías activas existentes
  const categories = await client.category.findMany({
    select: { id: true, name: true, isActive: true },
  });
  const categoryByName = new Map<string, { id: string; name: string; isActive: boolean }>();
  for (const c of categories) {
    categoryByName.set(normalizeHeader(c.name), c);
  }

  // Consultar códigos existentes en DB
  const existingProductCodes = new Set<string>();
  const dbProducts = await client.product.findMany({
    select: { code: true, barcode: true },
  });
  for (const p of dbProducts) {
    existingProductCodes.add(p.code.trim().toLowerCase());
  }

  // Consultar códigos de barra existentes en productos y presentaciones
  const existingBarcodes = new Set<string>();
  for (const p of dbProducts) {
    if (p.barcode) existingBarcodes.add(p.barcode.trim().toLowerCase());
  }
  const dbPresentations = await client.productPresentation.findMany({
    where: { barcode: { not: null } },
    select: { barcode: true },
  });
  for (const pres of dbPresentations) {
    if (pres.barcode) existingBarcodes.add(pres.barcode.trim().toLowerCase());
  }

  // Rastrear duplicados dentro del archivo
  const fileCodesCount = new Map<string, number>();
  const fileBarcodesCount = new Map<string, number>();

  for (const r of rawRows) {
    if (r.code) {
      const norm = r.code.trim().toLowerCase();
      fileCodesCount.set(norm, (fileCodesCount.get(norm) ?? 0) + 1);
    }
    if (r.barcode) {
      const norm = r.barcode.trim().toLowerCase();
      fileBarcodesCount.set(norm, (fileBarcodesCount.get(norm) ?? 0) + 1);
    }
  }

  const processedRows: ProductImportRowDto[] = [];
  let validCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  let duplicateCount = 0;

  for (const r of rawRows) {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isDuplicate = false;

    // Validación SKU / Código
    const cleanCode = r.code.trim();
    if (!cleanCode) {
      errors.push('El código interno (SKU) es obligatorio.');
    } else if (cleanCode.length < 2 || cleanCode.length > 50) {
      errors.push('El código interno (SKU) debe tener entre 2 y 50 caracteres.');
    } else {
      const lowerCode = cleanCode.toLowerCase();
      if ((fileCodesCount.get(lowerCode) ?? 0) > 1) {
        errors.push(`Código (SKU) duplicado en el mismo archivo: "${cleanCode}".`);
        isDuplicate = true;
      }
      if (existingProductCodes.has(lowerCode)) {
        errors.push(`El código (SKU) "${cleanCode}" ya existe en el catálogo.`);
        isDuplicate = true;
      }
    }

    // Validación Nombre Comercial
    const cleanName = r.name.trim();
    if (!cleanName) {
      errors.push('El nombre comercial del producto es obligatorio.');
    } else if (cleanName.length < 2 || cleanName.length > 150) {
      errors.push('El nombre debe tener entre 2 y 150 caracteres.');
    }

    // Validación Categoría
    let matchedCategoryName = r.categoryRaw.trim();
    if (!r.categoryRaw.trim()) {
      errors.push('La categoría es obligatoria.');
    } else {
      const foundCat = categoryByName.get(normalizeHeader(r.categoryRaw));
      if (!foundCat) {
        errors.push(`La categoría "${r.categoryRaw}" no existe en el sistema.`);
      } else if (!foundCat.isActive) {
        errors.push(`La categoría "${foundCat.name}" se encuentra inactiva.`);
      } else {
        matchedCategoryName = foundCat.name;
      }
    }

    // Validación Código de Barras
    let cleanBarcode: string | null = null;
    if (r.barcode) {
      const trimmedBarcode = r.barcode.trim();
      if (trimmedBarcode.length < 3 || trimmedBarcode.length > 50) {
        errors.push('El código de barras debe tener entre 3 y 50 caracteres.');
      } else {
        cleanBarcode = trimmedBarcode;
        const lowerBarcode = trimmedBarcode.toLowerCase();
        if ((fileBarcodesCount.get(lowerBarcode) ?? 0) > 1) {
          errors.push(`Código de barras duplicado en el mismo archivo: "${trimmedBarcode}".`);
          isDuplicate = true;
        }
        if (existingBarcodes.has(lowerBarcode)) {
          errors.push(`El código de barras "${trimmedBarcode}" ya está registrado en el sistema.`);
          isDuplicate = true;
        }
      }
    }

    // Validación Precio Base
    const parsedPrice = parseNumericValue(r.basePriceRaw, 'Precio Base');
    if (parsedPrice.error) {
      errors.push(parsedPrice.error);
    }

    // Validación Costo Base
    const parsedCost = parseNumericValue(r.baseCostRaw, 'Costo Base');
    if (parsedCost.error) {
      errors.push(parsedCost.error);
    }

    // Validación Control de Inventario
    const { mode: controlMode, error: controlError } = parseControlMode(r.controlModeRaw, defaultMode);
    if (controlError) {
      errors.push(controlError);
    }

    // Validación Fórmula Médica
    const prescriptionVal = parseBooleanValue(r.prescriptionRequiredRaw, false);
    if (prescriptionVal === null) {
      errors.push('El campo "Requiere Fórmula Médica" debe ser SI o NO.');
    }
    const prescriptionRequired = prescriptionVal ?? false;

    // Regla sectorial farmacia: bajo fórmula médica exige LOT_EXPIRY
    if (prescriptionRequired && controlMode !== 'LOT_EXPIRY') {
      errors.push('Un producto que requiere fórmula médica debe tener control de inventario "LOT_EXPIRY" (Lote y Vencimiento).');
    }

    // Validación Estado
    const activeVal = parseBooleanValue(r.isActiveRaw, true);
    if (activeVal === null) {
      errors.push('El campo "Estado" debe ser ACTIVO o INACTIVO.');
    }
    const isActive = activeVal ?? true;

    // Advertencia informativa sobre creación sin inventario inicial
    warnings.push('Se creará en el catálogo con saldo cero sin afectar Kardex ni contabilidad.');

    if (isDuplicate) {
      duplicateCount++;
    }

    if (errors.length > 0) {
      errorCount++;
    } else {
      validCount++;
    }

    if (warnings.length > 0) {
      warningCount++;
    }

    processedRows.push({
      row: r.rowNumber,
      code: cleanCode,
      barcode: cleanBarcode,
      name: cleanName,
      categoryName: matchedCategoryName,
      genericName: r.genericName?.trim() || null,
      concentration: r.concentration?.trim() || null,
      sanitaryRegistry: r.sanitaryRegistry?.trim() || null,
      manufacturer: r.manufacturer?.trim() || null,
      description: r.description?.trim() || null,
      baseUnit: r.baseUnit.trim().toUpperCase() || 'UNIDAD',
      basePrice: parsedPrice.value,
      baseCost: parsedCost.value,
      inventoryControlMode: controlMode,
      prescriptionRequired,
      isActive,
      errors,
      warnings,
    });
  }

  return {
    previewHash,
    totalRows: rawRows.length,
    validCount,
    errorCount,
    warningCount,
    duplicateCount,
    rows: processedRows,
  };
}

/**
 * Confirma e importa los productos validados en la base de datos dentro de una transacción ACID.
 * Garantiza cero movimientos de inventario y cero asientos contables.
 */
export async function confirmProductImport(
  buffer: Buffer,
  previewHash: string,
  user: { id: string; ipAddress?: string | null; correlationId?: string | null },
  client: PrismaClient = prisma,
  auditService?: AuditService,
): Promise<{ importedCount: number }> {
  const currentHash = createHash('sha256').update(buffer).digest('hex');
  if (currentHash !== previewHash) {
    throw new BadRequestException('El archivo enviado ha cambiado respecto a la vista previa. Por favor valida de nuevo.');
  }

  const preview = await parseAndValidateProductWorkbook(buffer, client);
  if (preview.errorCount > 0) {
    throw new BadRequestException(
      `El archivo contiene ${preview.errorCount} fila(s) con errores. Corrige los datos antes de importar.`,
    );
  }

  // Mapear nombres de categorías a UUIDs
  const categories = await client.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const catMap = new Map<string, string>();
  for (const c of categories) {
    catMap.set(normalizeHeader(c.name), c.id);
  }

  const { rules } = await sectorProfileRules(client);

  return client.$transaction(async (tx) => {
    const createdProductIds: string[] = [];
    const createdProductCodes: string[] = [];

    for (const row of preview.rows) {
      const categoryId = catMap.get(normalizeHeader(row.categoryName));
      if (!categoryId) {
        throw new ConflictException(`La categoría "${row.categoryName}" ya no está disponible.`);
      }

      // Validación concurrente por si otro usuario creó el producto mientras se validaba
      const existing = await tx.product.findFirst({
        where: {
          OR: [
            { code: { equals: row.code, mode: 'insensitive' as const } },
            ...(row.barcode ? [{ barcode: { equals: row.barcode, mode: 'insensitive' as const } }] : []),
          ],
        },
      });

      if (existing) {
        throw new ConflictException(
          `Conflicto de concurrencia: el producto con código o barra "${row.code}" ya fue registrado.`,
        );
      }

      const product = await tx.product.create({
        data: {
          code: row.code,
          barcode: row.barcode,
          name: row.name,
          categoryId,
          genericName: row.genericName,
          concentration: row.concentration,
          sanitaryRegistry: row.sanitaryRegistry,
          manufacturer: row.manufacturer,
          description: row.description,
          baseUnit: row.baseUnit,
          basePrice: new Prisma.Decimal(row.basePrice.toFixed(2)),
          baseCost: new Prisma.Decimal(row.baseCost.toFixed(2)),
          inventoryControlMode: row.inventoryControlMode,
          prescriptionRequired: row.prescriptionRequired,
          isActive: row.isActive,
        },
      });

      createdProductIds.push(product.id);
      createdProductCodes.push(product.code);
    }

    if (auditService) {
      await auditService.recordEvent(
        {
          userId: user.id,
          action: 'catalog:products_imported',
          entity: 'Product',
          details: {
            importedCount: createdProductIds.length,
            sampleCodes: createdProductCodes.slice(0, 10),
          },
          ipAddress: user.ipAddress || null,
          correlationId: user.correlationId || null,
        },
        tx,
      );
    }

    return { importedCount: createdProductIds.length };
  });
}

/**
 * Genera la plantilla de importación en formato .xlsx con dos hojas:
 * 1. Hoja 'Productos' con encabezados claros y filas de ejemplo.
 * 2. Hoja 'Instrucciones y Catálogos' con los catálogos permitidos y guía.
 */
export async function buildProductImportTemplate(
  categories: Array<{ id: string; name: string }> = [],
  unitsOfMeasure: Array<{ code: string; name: string }> = [],
  defaultControlMode: InventoryControlMode = 'LOT_EXPIRY',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Farmacontrol';
  workbook.created = new Date();

  // Hoja 1: Productos
  const sheetProducts = workbook.addWorksheet('Productos', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheetProducts.columns = [
    { header: 'Código (SKU) *', key: 'code', width: 16 },
    { header: 'Nombre Comercial *', key: 'name', width: 32 },
    { header: 'Categoría *', key: 'category', width: 24 },
    { header: 'Precio Base *', key: 'basePrice', width: 16 },
    { header: 'Código de Barras', key: 'barcode', width: 20 },
    { header: 'Principio Activo', key: 'genericName', width: 26 },
    { header: 'Concentración', key: 'concentration', width: 18 },
    { header: 'Registro Sanitario', key: 'sanitaryRegistry', width: 22 },
    { header: 'Laboratorio / Fabricante', key: 'manufacturer', width: 26 },
    { header: 'Descripción', key: 'description', width: 30 },
    { header: 'Unidad Base', key: 'baseUnit', width: 16 },
    { header: 'Costo Base', key: 'baseCost', width: 16 },
    { header: 'Control de Inventario', key: 'controlMode', width: 22 },
    { header: 'Requiere Fórmula Médica', key: 'prescriptionRequired', width: 24 },
    { header: 'Estado', key: 'status', width: 14 },
  ];

  // Estilo cabecera
  const headerRow = sheetProducts.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1565C0' }, // Azul corporativo
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  const sampleCategory = categories[0]?.name || 'Medicamentos';
  const sampleUnit = unitsOfMeasure[0]?.code || 'UNIDAD';

  // Filas de ejemplo ficticias
  sheetProducts.addRow({
    code: 'IBU-400',
    name: 'Ibuprofeno 400 mg',
    category: sampleCategory,
    basePrice: 1500,
    barcode: '7701234567890',
    genericName: 'Ibuprofeno',
    concentration: '400 mg',
    sanitaryRegistry: 'INVIMA 2021M-001234',
    manufacturer: 'Laboratorios Farmacia',
    description: 'Analgésico y antiinflamatorio en tabletas',
    baseUnit: sampleUnit,
    baseCost: 800,
    controlMode: defaultControlMode,
    prescriptionRequired: 'NO',
    status: 'ACTIVO',
  });

  sheetProducts.addRow({
    code: 'AMOX-500',
    name: 'Amoxicilina 500 mg Cápsulas',
    category: sampleCategory,
    basePrice: 3200,
    barcode: '7709999888877',
    genericName: 'Amoxicilina Trihidrato',
    concentration: '500 mg',
    sanitaryRegistry: 'INVIMA 2020M-005678',
    manufacturer: 'Genfar',
    description: 'Antibiótico bactericida bajo fórmula médica',
    baseUnit: sampleUnit,
    baseCost: 1900,
    controlMode: 'LOT_EXPIRY',
    prescriptionRequired: 'SI',
    status: 'ACTIVO',
  });

  sheetProducts.addRow({
    code: 'SUERO-01',
    name: 'Suero Oral Rehidratante Manzana 500 ml',
    category: sampleCategory,
    basePrice: 6500,
    barcode: '',
    genericName: 'Sales de rehidratación oral',
    concentration: '500 ml',
    sanitaryRegistry: 'INVIMA 2019M-009988',
    manufacturer: 'Tecnoquímicas',
    description: 'Solución hidroelectrolítica oral',
    baseUnit: sampleUnit,
    baseCost: 3800,
    controlMode: 'SIMPLE',
    prescriptionRequired: 'NO',
    status: 'ACTIVO',
  });

  // Hoja 2: Instrucciones y Catálogos
  const sheetGuide = workbook.addWorksheet('Instrucciones y Catálogos');
  sheetGuide.columns = [
    { header: 'Parámetro / Instrucción', key: 'param', width: 32 },
    { header: 'Valores Permitidos / Descripción', key: 'desc', width: 60 },
  ];

  const guideHeader = sheetGuide.getRow(1);
  guideHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  guideHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2E7D32' }, // Verde
  };
  guideHeader.height = 24;

  sheetGuide.addRow({
    param: 'CAMPOS OBLIGATORIOS (*)',
    desc: 'Código (SKU), Nombre Comercial, Categoría y Precio Base.',
  });
  sheetGuide.addRow({
    param: 'POLÍTICA DE DUPLICADOS',
    desc: 'No se sobrescriben productos existentes. Si el SKU o Código de Barras ya existe en la DB o se repite en el archivo, se reporta como error.',
  });
  sheetGuide.addRow({
    param: 'INVENTARIO INICIAL',
    desc: 'Los productos se crean en el catálogo con existencia inicial 0. No genera movimientos de inventario, Kardex ni asientos contables.',
  });
  sheetGuide.addRow({
    param: 'MODOS DE CONTROL DE INVENTARIO',
    desc: 'LOT_EXPIRY (Lote y Vencimiento FEFO), SIMPLE (Inventario simple por entradas/salidas), SERVICE (Servicios sin existencias), SERIAL (Números de serie únicos), LOT (Solo lote sin fecha obligatoria).',
  });
  sheetGuide.addRow({
    param: 'REGLA REGULATORIA',
    desc: 'Si "Requiere Fórmula Médica" es SI, el modo de control debe ser obligatoriamente LOT_EXPIRY.',
  });
  sheetGuide.addRow({
    param: 'VALORES BOOLEANOS',
    desc: 'SI o NO (también acepta ACTIVO / INACTIVO para la columna Estado).',
  });

  sheetGuide.addRow({ param: '', desc: '' });
  sheetGuide.addRow({
    param: 'CATEGORÍAS EXISTENTES EN EL SISTEMA:',
    desc: categories.map((c) => c.name).join(', ') || 'Sin categorías configuradas',
  });

  sheetGuide.addRow({
    param: 'UNIDADES DE MEDIDA DISPONIBLES:',
    desc: unitsOfMeasure.map((u) => `${u.code} (${u.name})`).join(', ') || 'UNIDAD',
  });

  const bufferResult = await workbook.xlsx.writeBuffer();
  return Buffer.from(bufferResult);
}

/**
 * Exporta el catálogo de productos actual a un archivo Excel (.xlsx).
 */
export async function exportProductsWorkbook(products: ProductDto[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Farmacontrol';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Catálogo de Productos', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Código (SKU)', key: 'code', width: 16 },
    { header: 'Código de Barras', key: 'barcode', width: 20 },
    { header: 'Nombre Comercial', key: 'name', width: 34 },
    { header: 'Categoría', key: 'categoryName', width: 22 },
    { header: 'Principio Activo', key: 'genericName', width: 26 },
    { header: 'Concentración', key: 'concentration', width: 18 },
    { header: 'Registro Sanitario', key: 'sanitaryRegistry', width: 22 },
    { header: 'Laboratorio / Fabricante', key: 'manufacturer', width: 26 },
    { header: 'Unidad Base', key: 'baseUnit', width: 14 },
    { header: 'Precio Base', key: 'basePrice', width: 16 },
    { header: 'Costo Base', key: 'baseCost', width: 16 },
    { header: 'Control de Inventario', key: 'inventoryControlMode', width: 22 },
    { header: 'Fórmula Médica', key: 'prescriptionRequired', width: 16 },
    { header: 'Estado', key: 'isActive', width: 14 },
    { header: 'Stock Actual', key: 'availableStock', width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0D47A1' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  for (const p of products) {
    sheet.addRow({
      code: p.code,
      barcode: p.barcode || '—',
      name: p.name,
      categoryName: p.categoryName || '—',
      genericName: p.genericName || '—',
      concentration: p.concentration || '—',
      sanitaryRegistry: p.sanitaryRegistry || '—',
      manufacturer: p.manufacturer || '—',
      baseUnit: p.baseUnit,
      basePrice: Number(p.basePrice),
      baseCost: Number(p.baseCost),
      inventoryControlMode: p.inventoryControlMode,
      prescriptionRequired: p.prescriptionRequired ? 'SI' : 'NO',
      isActive: p.isActive ? 'ACTIVO' : 'INACTIVO',
      availableStock: p.availableStock ?? 0,
    });
  }

  // Formato numérico para precios y costos
  sheet.getColumn('basePrice').numFmt = '"$"#,##0.00';
  sheet.getColumn('baseCost').numFmt = '"$"#,##0.00';

  const bufferResult = await workbook.xlsx.writeBuffer();
  return Buffer.from(bufferResult);
}
