import { z } from 'zod';
import type { SaleDto } from '@farmacia/contracts';

export const createCreditNoteSchema = (lines: SaleDto['lines']) =>
  z
    .object({
      quantities: z.record(z.string(), z.string()),
      reason: z
        .string()
        .refine((value) => value.trim().length >= 5, 'El motivo debe tener mínimo 5 caracteres.'),
      restock: z.boolean(),
      refundMethod: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CREDITO_CARTERA']),
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
            message: 'Ingresa una cantidad entre 0 y lo vendido.',
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
export type CreditNoteFormValues = z.infer<ReturnType<typeof createCreditNoteSchema>>;
