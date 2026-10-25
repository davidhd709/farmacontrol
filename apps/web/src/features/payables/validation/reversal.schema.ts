import { z } from 'zod';

export const reversalSchema = z.object({
  reason: z.string().refine((value) => value.trim().length >= 1, 'El motivo es obligatorio'),
});
export type ReversalFormData = z.infer<typeof reversalSchema>;
