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

const requiredText = (message: string) => z.string().refine((value) => !!value.trim(), message);
export const expenseSchema = z
  .object({
    categoryId: requiredText('Selecciona una categoría de gasto'),
    beneficiary: requiredText('El beneficiario es obligatorio'),
    description: requiredText('La descripción es obligatoria'),
    documentNumber: z.string(),
    amount: moneySchema,
    expenseDate: requiredText('La fecha del gasto es obligatoria'),
    dueDate: z.string(),
    paymentMethod: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CREDITO'], {
      error: 'Selecciona la forma de pago',
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
    if (data.paymentMethod === 'CREDITO' && !data.dueDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: 'La fecha de vencimiento es obligatoria para gastos a crédito',
      });
    }
  });
export type ExpenseFormData = z.infer<typeof expenseSchema>;
