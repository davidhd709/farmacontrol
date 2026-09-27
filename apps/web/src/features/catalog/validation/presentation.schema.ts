import { z } from 'zod';

export const presentationSchema = z.object({
  unitOfMeasureId: z.string().optional().nullable(),
  containedPresentationId: z.string().optional().nullable(),
  name: z
    .string()
    .trim()
    .max(100, 'El nombre no puede exceder 100 caracteres')
    .optional(),
  barcode: z
    .string()
    .trim()
    .max(100, 'El código de barras no puede exceder 100 caracteres')
    .optional()
    .or(z.literal('')),
  quantityContained: z
    .number({ message: 'Ingresa un factor de conversión válido' })
    .int('El factor de conversión debe ser un número entero')
    .min(1, 'El factor de conversión debe ser mayor o igual a 1'),
  price: z
    .number({ message: 'Ingresa un precio de venta válido' })
    .min(0, 'El precio de venta no puede ser negativo'),
  cost: z
    .number({ message: 'Ingresa un costo de referencia válido' })
    .min(0, 'El costo no puede ser negativo'),
  purchaseEnabled: z.boolean(),
  saleEnabled: z.boolean(),
  isDefault: z.boolean(),
  isDefaultPurchase: z.boolean(),
  isDefaultSale: z.boolean(),
});

export type PresentationFormValues = z.infer<typeof presentationSchema>;
