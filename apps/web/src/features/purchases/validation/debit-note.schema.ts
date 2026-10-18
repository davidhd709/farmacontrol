import { z } from 'zod';
import type { PurchaseDto } from '@farmacia/contracts';

export const createDebitNoteSchema = (lines: PurchaseDto['lines']) =>
  z
    .object({
      quantities: z.record(z.string(), z.string()),
      reason: z
        .string()
        .refine((value) => value.trim().length >= 5, 'El motivo debe tener mínimo 5 caracteres.'),
    })
    .superRefine(({ quantities }, ctx) => {
      let hasItems = false;
      lines.forEach((line) => {
        const quantity = Number(quantities[line.id] || 0);
        if (
          !Number.isFinite(quantity) ||
          quantity < 0 ||
          quantity > Number(line.quantityCommercial)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['quantities', line.id],
            message: 'Ingresa una cantidad entre 0 y lo comprado.',
          });
        }
        if (quantity > 0) hasItems = true;
      });
      if (!hasItems)
        ctx.addIssue({
          code: 'custom',
          path: ['quantities', lines[0]?.id ?? 'root'],
          message: 'Selecciona al menos una cantidad a devolver.',
        });
    });
export type DebitNoteFormValues = z.infer<ReturnType<typeof createDebitNoteSchema>>;
