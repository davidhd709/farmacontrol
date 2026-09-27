import { z } from 'zod';

export const productSchema = z.object({
  categoryId: z.string().trim().min(1, 'Debes seleccionar una categoría'),
  code: z
    .string()
    .trim()
    .min(2, 'El código interno (SKU) debe tener al menos 2 caracteres')
    .max(50, 'El código no puede exceder 50 caracteres'),
  barcode: z
    .string()
    .trim()
    .max(50, 'El código de barras no puede exceder 50 caracteres')
    .optional()
    .or(z.literal('')),
  name: z
    .string()
    .trim()
    .min(2, 'El nombre comercial debe tener al menos 2 caracteres')
    .max(150, 'El nombre comercial no puede exceder 150 caracteres'),
  genericName: z
    .string()
    .trim()
    .max(150, 'El principio activo no puede exceder 150 caracteres')
    .optional()
    .or(z.literal('')),
  concentration: z
    .string()
    .trim()
    .max(50, 'La concentración no puede exceder 50 caracteres')
    .optional()
    .or(z.literal('')),
  sanitaryRegistry: z
    .string()
    .trim()
    .max(50, 'El registro sanitario no puede exceder 50 caracteres')
    .optional()
    .or(z.literal('')),
  manufacturer: z
    .string()
    .trim()
    .max(100, 'El fabricante no puede exceder 100 caracteres')
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .trim()
    .max(500, 'La descripción no puede exceder 500 caracteres')
    .optional()
    .or(z.literal('')),
  requiresLotControl: z.boolean(),
  prescriptionRequired: z.boolean(),
  baseUnit: z.string().trim().min(1, 'La unidad base es requerida'),
  basePrice: z
    .number({ message: 'Ingresa un precio base válido' })
    .min(0, 'El precio base no puede ser negativo'),
  baseCost: z
    .number({ message: 'Ingresa un costo base válido' })
    .min(0, 'El costo base no puede ser negativo'),
});

export type ProductFormValues = z.infer<typeof productSchema>;
