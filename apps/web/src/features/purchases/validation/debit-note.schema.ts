import { z } from 'zod';
import type { PurchaseDto } from '@farmacia/contracts';

/**
 * `maxByLine`: lo que hoy se puede devolver por línea en unidades comerciales (lo recibido menos
 * lo ya devuelto, limitado por la existencia del lote). Sin ese dato se limita a lo comprado.
 */
export const createDebitNoteSchema = (
  lines: PurchaseDto['lines'],
  maxByLine: Record<string, number> = {},
) =>
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
        const max = maxByLine[line.id];
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
        } else if (max !== undefined && quantity > max) {
          ctx.addIssue({
            code: 'custom',
            path: ['quantities', line.id],
            message: `Solo se pueden devolver ${max}.`,
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
