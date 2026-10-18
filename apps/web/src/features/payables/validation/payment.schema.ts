import { z } from 'zod';
import { toCents } from '../../../utils/money';

export const moneySchema = z.string().superRefine((value, ctx) => {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Ingresa un importe mayor a cero con máximo 2 decimales',
    });
    return;
  }
  try {
    if (toCents(value) <= 0)
      ctx.addIssue({ code: 'custom', message: 'El monto debe ser mayor a cero' });
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Importe monetario fuera de rango' });
  }
});

export const createPaymentSchema = (balance: string | number) =>
  z
    .object({
      amount: moneySchema,
      paymentMethod: z.enum(['EFECTIVO', 'TRANSFERENCIA'], {
        error: 'Selecciona el método de pago',
      }),
      bankAccountId: z.string().optional(),
      notes: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.paymentMethod === 'TRANSFERENCIA' && !data.bankAccountId?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['bankAccountId'],
          message: 'Selecciona la cuenta bancaria',
        });
      }
      if (moneySchema.safeParse(data.amount).success && toCents(data.amount) > toCents(balance)) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: 'El monto no puede superar el saldo pendiente',
        });
      }
    });

export type PaymentFormData = z.infer<ReturnType<typeof createPaymentSchema>>;
