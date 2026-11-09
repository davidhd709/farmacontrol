import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import {
  buildProductImportTemplate,
  preflightZip,
  parseAndValidateProductWorkbook,
} from '../../src/modules/catalog/infrastructure/excel-product-import';

describe('Excel Product Import / Export', () => {
  describe('buildProductImportTemplate', () => {
    it('genera una plantilla válida con las hojas Productos e Instrucciones y Catálogos', async () => {
      const buffer = await buildProductImportTemplate();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);

      // Preflight zip anti-bomba debe validar el buffer generado
      expect(() => preflightZip(buffer)).not.toThrow();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);

      const productsSheet = workbook.getWorksheet('Productos');
      expect(productsSheet).toBeDefined();
      expect(productsSheet?.rowCount).toBeGreaterThanOrEqual(1);

      // Comprobar encabezados clave
      const headers: string[] = [];
      productsSheet?.getRow(1).eachCell((cell) => {
        headers.push(String(cell.value));
      });
      expect(headers).toContain('Código (SKU) *');
      expect(headers).toContain('Nombre Comercial *');
      expect(headers).toContain('Categoría *');
      expect(headers).toContain('Precio Base *');
      expect(headers).toContain('Control de Inventario');

      const instructionsSheet = workbook.getWorksheet('Instrucciones y Catálogos');
      expect(instructionsSheet).toBeDefined();
    });
  });

  describe('preflightZip', () => {
    it('rechaza buffers arbitrarios que no son ZIP/XLSX válidos', () => {
      const fakeBuffer = Buffer.from('Este no es un archivo excel');
      expect(() => preflightZip(fakeBuffer)).toThrow(BadRequestException);
    });

    it('rechaza buffers truncados', () => {
      const truncated = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      expect(() => preflightZip(truncated)).toThrow(BadRequestException);
    });
  });

  describe('parseAndValidateProductWorkbook', () => {
    it('detecta filas con datos faltantes o inválidos y calcula el previewHash', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Productos');
      sheet.addRow([
        'Código (SKU) *',
        'Nombre Comercial *',
        'Categoría *',
        'Precio Base *',
        'Código de Barras',
        'Principio Activo',
        'Concentración',
        'Registro Sanitario',
        'Laboratorio / Fabricante',
        'Descripción',
        'Unidad Base',
        'Costo Base',
        'Control de Inventario',
        'Requiere Fórmula Médica',
        'Estado',
      ]);
      // Fila 1: Producto válido
      sheet.addRow([
        'SKU-TEST-001',
        'Acetaminofén 500mg',
        'Analgésicos',
        '1500',
        '7701234567890',
        'Paracetamol',
        '500mg',
        'INVIMA-1234',
        'Lab Test',
        'Analgésico',
        'UNIDAD',
        '800',
        'LOT_EXPIRY',
        'NO',
        'ACTIVO',
      ]);
      // Fila 2: Producto con SKU duplicado con fila 3
      sheet.addRow([
        'SKU-TEST-DUP',
        'Acetaminofén Genérico',
        'Analgésicos',
        '1200',
        '',
        '',
        '',
        '',
        '',
        '',
        'UNIDAD',
        '700',
        'LOT_EXPIRY',
        'NO',
        'ACTIVO',
      ]);
      // Fila 3: Producto duplicado sin precio y sin nombre
      sheet.addRow([
        'SKU-TEST-DUP',
        '',
        'Analgésicos',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '500',
        'INVALID_MODE',
        '',
        '',
      ]);

      const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;

      const mockPrisma = {
        category: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'cat-1', name: 'Analgésicos', isActive: true },
          ]),
        },
        product: { findMany: vi.fn().mockResolvedValue([]) },
        productPresentation: { findMany: vi.fn().mockResolvedValue([]) },
        company: { findFirst: vi.fn().mockResolvedValue({ sectorProfile: 'PHARMACY' }) },
      } as any;

      const preview = await parseAndValidateProductWorkbook(buffer, mockPrisma);

      expect(preview.totalRows).toBe(3);
      expect(preview.validCount).toBe(1);
      expect(preview.errorCount).toBe(2);
      expect(preview.previewHash).toBeDefined();
      expect(preview.previewHash.length).toBe(64); // SHA-256 hex length

      // Fila 1 debe ser válida
      expect(preview.rows[0].errors).toHaveLength(0);
      expect(preview.rows[0].name).toBe('Acetaminofén 500mg');
      expect(preview.rows[0].code).toBe('SKU-TEST-001');

      // Fila 2 debe reportar duplicado en archivo
      expect(preview.rows[1].errors.length).toBeGreaterThan(0);
      expect(preview.rows[1].errors.some((e) => e.includes('duplicado'))).toBe(true);

      // Fila 3 debe reportar nombre faltante, precio faltante y modo inválido
      expect(preview.rows[2].errors.length).toBeGreaterThan(0);
      expect(preview.rows[2].errors.some((e) => e.toLowerCase().includes('nombre'))).toBe(true);
      expect(preview.rows[2].errors.some((e) => e.toLowerCase().includes('precio'))).toBe(true);
    });
  });
});
