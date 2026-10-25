import { z } from 'zod';

export const reversalSchema = z.object({
  reason: z
    .string()
    .refine((value) => value.trim().length >= 5, 'El motivo es obligatorio; mínimo 5 caracteres'),
});
export type ReversalFormData = z.infer<typeof reversalSchema>;
