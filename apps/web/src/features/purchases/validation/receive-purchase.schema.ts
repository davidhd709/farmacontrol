import { z } from 'zod';
import type { ProductDto } from '@farmacia/contracts';
import { toCents } from '../../../utils/money';
import { businessToday } from '../../../utils/business-date';

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
            lotNumber: required('Ingresa el número de lote.'),
            expirationDate: required('Ingresa la fecha de vencimiento.').superRefine(
              (value, ctx) => {
                if (!value) return;
                // Comparación de días calendario de Bogotá: `new Date('YYYY-MM-DD')` es medianoche
                // UTC (7 p. m. del día anterior aquí) y rechazaba lotes que vencen mañana.
                if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value <= businessToday()) {
                  ctx.addIssue({
                    code: 'custom',
                    message: 'La fecha de vencimiento no puede ser anterior ni igual a hoy.',
                  });
                }
              },
            ),
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
export const emptyPurchaseLine = (): PurchaseFormLine => ({
  productId: '',
  presentationId: '',
  lotNumber: '',
  expirationDate: '',
  quantityCommercial: '1',
  unitCost: '0',
});
