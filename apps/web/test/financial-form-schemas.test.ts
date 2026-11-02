import { describe, expect, it } from 'vitest';
import { reversalSchema as receivableReversal } from '../src/features/receivables/validation/reversal.schema';
import { reversalSchema as payableReversal } from '../src/features/payables/validation/reversal.schema';
import { expenseSchema } from '../src/features/expenses/validation/expense.schema';
import { expenseReasonSchema } from '../src/features/expenses/validation/expense-reason.schema';

const expense = {
  amount: '0.30',
  notes: '',
  categoryId: 'category',
  beneficiary: 'Proveedor',
  description: 'Servicio',
  documentNumber: '',
  expenseDate: '2026-10-18',
  dueDate: '',
};

describe.each([
  ['causación de gasto', expenseSchema, expense],
])('Esquema de %s', (_name, schema, valid) => {
  it('acepta el formulario válido sin transformar el importe', () => {
    expect(schema.parse(valid)).toEqual(valid);
  });
  it.each([
    '',
    '0',
    '-0.01',
    '0.001',
    '1.999',
    '1e2',
    'NaN',
    'Infinity',
    '1,20',
    '90071992547409999',
    '1000000000000',
    '00.10',
  ])('rechaza el importe %s', (amount) => {
    expect(schema.safeParse({ ...valid, amount }).success).toBe(false);
  });
});

it('la causación exige categoría, beneficiario, descripción y fecha, sin medio de pago ni estado', () => {
  for (const field of ['categoryId', 'beneficiary', 'description', 'expenseDate']) {
    expect(expenseSchema.safeParse({ ...expense, [field]: '' }).success).toBe(false);
  }
  expect(expenseSchema.safeParse({ ...expense, dueDate: '2026-11-18' }).success).toBe(true);
  expect(expenseSchema.safeParse({ ...expense, dueDate: '2026-10-01' }).success).toBe(false);
  expect(Object.keys(expenseSchema.parse(expense))).not.toContain('paymentMethod');
});

describe.each([
  ['cartera', receivableReversal, 5],
  ['proveedores', payableReversal, 1],
  ['gastos', expenseReasonSchema, 5],
])('Motivo de %s', (_name, schema, minimum) => {
  it('rechaza vacíos y conserva la longitud mínima actual sin transformar el texto', () => {
    expect(schema.safeParse({ reason: '    ' }).success).toBe(false);
    expect(schema.safeParse({ reason: 'a'.repeat(Number(minimum) - 1) }).success).toBe(false);
    const data = { reason: ` ${'a'.repeat(Number(minimum))} ` };
    expect(schema.parse(data)).toEqual(data);
  });
});
