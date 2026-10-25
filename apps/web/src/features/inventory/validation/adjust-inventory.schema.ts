import { z } from 'zod';
import {
  INVENTORY_ADJUSTMENT_REASON_MAX_LENGTH,
  INVENTORY_MOVEMENT_NOTES_MAX_LENGTH,
  type InventoryLotDto,
} from '@farmacia/contracts';

export const createAdjustInventorySchema = (lots: InventoryLotDto[]) =>
  z
    .object({
      productId: z.string().min(1, 'Seleccione el producto a ajustar.'),
      lotId: z.string().min(1, 'Seleccione el lote específico.'),
      adjustmentType: z.enum(['INCREMENTO', 'DECREMENTO']),
      quantity: z
        .number()
        .int('La cantidad debe ser un número entero de unidades base.')
        .positive('La cantidad debe ser mayor a 0.'),
      reason: z
        .string()
        .refine(
          (value) => value.trim().length > 0,
          'La justificación o motivo del ajuste es obligatoria.',
        )
        .max(
          INVENTORY_ADJUSTMENT_REASON_MAX_LENGTH,
          'El motivo no puede superar los 250 caracteres.',
        ),
      notes: z
        .string()
        .max(
          INVENTORY_MOVEMENT_NOTES_MAX_LENGTH,
          'Las notas no pueden superar los 500 caracteres.',
        ),
    })
    .superRefine((values, ctx) => {
      const lot = lots.find((l) => l.id === values.lotId);
      if (values.adjustmentType === 'DECREMENTO' && lot && values.quantity > lot.currentQuantity) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: `No puede descontar más de la existencia actual del lote (${lot.currentQuantity}).`,
        });
      }
    });
export type AdjustInventoryFormValues = z.infer<ReturnType<typeof createAdjustInventorySchema>>;
