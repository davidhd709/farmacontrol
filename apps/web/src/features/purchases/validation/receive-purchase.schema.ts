import { z } from 'zod';
import type { ProductDto } from '@farmacia/contracts';
import { toCents } from '../../../utils/money';
import { businessToday } from '../../../utils/business-date';

/** Series escritas una por línea o separadas por comas, normalizadas como el backend. */
export function parseSerialNumbers(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((serial) => serial.trim().toUpperCase())
    .filter((serial) => serial.length > 0);
}

const required = (message: string) =>
  z.string().refine((value) => value.trim().length > 0, message);

export const createReceivePurchaseSchema = (products: ProductDto[]) =>
  z
    .object({
      supplierId: required('Debes seleccionar un proveedor.'),
      invoiceNumber: required('El número de factura es obligatorio.'),
      purchaseDate: required('La fecha de compra es obligatoria.'),
      paymentCondition: z.enum(['CONTADO', 'CREDITO']),
      creditDays: z.string(),
      dueDate: required('La fecha de vencimiento de la factura es obligatoria.'),
      notes: z.string(),
      lines: z
        .array(
          z.object({
            productId: required('Selecciona un producto.'),
            presentationId: z.string(),
            // Lote, vencimiento y series dependen del modo de control del producto (superRefine)
            lotNumber: z.string(),
            expirationDate: z.string(),
            serialNumbers: z.string(),
            quantityCommercial: z
              .string()
              .refine(
                (value) =>
                  value.trim() !== '' &&
                  Number.isFinite(Number(value)) &&
                  Number(value) === parseFloat(value) &&
                  Number(value) > 0,
                'La cantidad comercial debe ser mayor a 0.',
              ),
            unitCost: z.string().refine((value) => {
              if (!/^\d+(\.\d{1,2})?$/.test(value)) return false;
              try {
                return toCents(value) >= 0;
              } catch {
                return false;
              }
            }, 'El costo debe ser mayor o igual a 0 y tener máximo 2 decimales.'),
          }),
        )
        .min(1, 'Agrega al menos una línea.'),
    })
    .superRefine((values, ctx) => {
      if (
        values.dueDate &&
        values.purchaseDate &&
        new Date(values.dueDate + 'T23:59:59') < new Date(values.purchaseDate + 'T00:00:00')
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['dueDate'],
          message:
            'La fecha de vencimiento de la factura no puede ser anterior a la fecha de emisión.',
        });
      }
      values.lines.forEach((line, index) => {
        const product = products.find((p) => p.id === line.productId);
        const factor =
          product?.presentations?.find((p) => p.id === line.presentationId)?.conversionFactor ?? 1;
        const units = Number(line.quantityCommercial) * factor;
        const issue = (field: keyof PurchaseLineShape, message: string) =>
          ctx.addIssue({ code: 'custom', path: ['lines', index, field], message });
        const mode = product?.inventoryControlMode;
        if (mode === 'LOT' || mode === 'LOT_EXPIRY') {
          if (!line.lotNumber.trim()) issue('lotNumber', 'Ingresa el número de lote.');
        }
        if (mode === 'LOT_EXPIRY') {
          // Comparación de días calendario de Bogotá: `new Date('YYYY-MM-DD')` es medianoche
          // UTC (7 p. m. del día anterior aquí) y rechazaba lotes que vencen mañana.
          if (!line.expirationDate.trim()) {
            issue('expirationDate', 'Ingresa la fecha de vencimiento.');
          } else if (
            !/^\d{4}-\d{2}-\d{2}$/.test(line.expirationDate) ||
            line.expirationDate <= businessToday()
          ) {
            issue(
              'expirationDate',
              'La fecha de vencimiento no puede ser anterior ni igual a hoy.',
            );
          }
        }
        if (mode === 'SERIAL') {
          const serials = parseSerialNumbers(line.serialNumbers);
          if (factor !== 1) {
            issue('presentationId', 'Los productos por serie se reciben en la unidad base.');
          } else if (serials.length !== units) {
            issue(
              'serialNumbers',
              `Escribe una serie por unidad: van ${serials.length} de ${Number.isFinite(units) ? units : 0}.`,
            );
          } else if (new Set(serials).size !== serials.length) {
            issue('serialNumbers', 'Hay series repetidas.');
          }
        }
        if (mode === 'SERVICE') {
          issue('productId', 'Un servicio no se recibe como inventario.');
        }
        // Misma tolerancia que PurchaseLine.create en backend.
        if (
          !Number.isFinite(units) ||
          Math.round(units) <= 0 ||
          Math.abs(units - Math.round(units)) > 1e-6
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['lines', index, 'quantityCommercial'],
            message: 'La cantidad × factor debe dar unidades base enteras.',
          });
        }
      });
    });

export type ReceivePurchaseFormValues = z.infer<ReturnType<typeof createReceivePurchaseSchema>>;
export type PurchaseFormLine = ReceivePurchaseFormValues['lines'][number];
type PurchaseLineShape = PurchaseFormLine;
export const emptyPurchaseLine = (): PurchaseFormLine => ({
  productId: '',
  presentationId: '',
  lotNumber: '',
  expirationDate: '',
  serialNumbers: '',
  quantityCommercial: '1',
  unitCost: '0',
});
