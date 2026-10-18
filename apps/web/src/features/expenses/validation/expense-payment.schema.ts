import { z } from 'zod';
import { moneySchema } from './expense.schema';
import { toCents } from '../../../utils/money';

export const createExpensePaymentSchema = (balance: string) =>
  z
    .object({
      amount: moneySchema,
      paymentDate: z.string().min(1, 'La fecha del pago es obligatoria'),
      paymentMethod: z.enum(['EFECTIVO', 'TRANSFERENCIA'], {
        error: 'Selecciona el medio de pago',
      }),
      bankAccountId: z.string(),
      notes: z.string(),
    })
    .superRefine((data, ctx) => {
      if (data.paymentMethod === 'TRANSFERENCIA' && !data.bankAccountId.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['bankAccountId'],
          message: 'Selecciona una cuenta bancaria para transferencia',
        });
      }
      if (moneySchema.safeParse(data.amount).success && toCents(data.amount) > toCents(balance)) {
        ctx.addIssue({
          code: 'custom',
          path: ['amount'],
          message: 'El monto a pagar no puede superar el saldo pendiente',
        });
      }
    });
export type ExpensePaymentFormData = z.infer<ReturnType<typeof createExpensePaymentSchema>>;
