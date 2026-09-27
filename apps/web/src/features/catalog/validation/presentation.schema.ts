import { z } from 'zod';

export const presentationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre de la presentación es obligatorio')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  barcode: z
    .string()
    .trim()
    .max(100, 'El código de barras no puede exceder 100 caracteres')
    .optional()
    .or(z.literal('')),
  conversionFactor: z
    .number({ message: 'Ingresa un factor de conversión válido' })
    .int('El factor de conversión debe ser un número entero')
    .min(1, 'El factor de conversión debe ser mayor o igual a 1'),
  price: z
    .number({ message: 'Ingresa un precio de venta válido' })
    .min(0, 'El precio de venta no puede ser negativo'),
  cost: z
    .number({ message: 'Ingresa un costo de referencia válido' })
    .min(0, 'El costo no puede ser negativo'),
  isDefault: z.boolean(),
});

export type PresentationFormValues = z.infer<typeof presentationSchema>;
