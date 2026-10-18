import { describe, expect, it } from 'vitest';
import { createPaymentSchema as receivableSchema } from '../src/features/receivables/validation/payment.schema';
import { createPaymentSchema as payableSchema } from '../src/features/payables/validation/payment.schema';
import { reversalSchema as receivableReversal } from '../src/features/receivables/validation/reversal.schema';
import { reversalSchema as payableReversal } from '../src/features/payables/validation/reversal.schema';
import { expenseSchema } from '../src/features/expenses/validation/expense.schema';
import { createExpensePaymentSchema } from '../src/features/expenses/validation/expense-payment.schema';
import { expenseReasonSchema } from '../src/features/expenses/validation/expense-reason.schema';

const payment = { amount: '0.30', paymentMethod: 'EFECTIVO', bankAccountId: '', notes: '' };
const expense = {
  ...payment,
  categoryId: 'category',
  beneficiary: 'Proveedor',
  description: 'Servicio',
  documentNumber: '',
  expenseDate: '2026-10-18',
  dueDate: '',
};

describe.each([
  ['cartera', receivableSchema('0.30'), payment],
  ['proveedores', payableSchema('0.30'), payment],
  ['pago de gasto', createExpensePaymentSchema('0.30'), { ...payment, paymentDate: '2026-10-18' }],
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
  it('exige medio de pago y banco sólo para transferencia', () => {
    expect(schema.safeParse({ ...valid, paymentMethod: '' }).success).toBe(false);
    expect(
      schema.safeParse({ ...valid, paymentMethod: 'TRANSFERENCIA', bankAccountId: ' ' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...valid, paymentMethod: 'TRANSFERENCIA', bankAccountId: 'bank' }).success,
    ).toBe(true);
  });
});

describe.each([receivableSchema, payableSchema, createExpensePaymentSchema])(
  'Saldo pendiente',
  (createSchema) => {
    it('acepta el saldo exacto y bloquea un centavo de exceso', () => {
      const schema = createSchema('0.30');
      const valid = { ...payment, paymentDate: '2026-10-18' };
      expect(schema.safeParse(valid).success).toBe(true);
      expect(schema.safeParse({ ...valid, amount: '0.31' }).success).toBe(false);
    });
  },
);

it('la causación exige categoría, beneficiario, descripción, fecha y vencimiento a crédito', () => {
  for (const field of ['categoryId', 'beneficiary', 'description', 'expenseDate']) {
    expect(expenseSchema.safeParse({ ...expense, [field]: '' }).success).toBe(false);
  }
  expect(expenseSchema.safeParse({ ...expense, paymentMethod: 'CREDITO' }).success).toBe(false);
  expect(
    expenseSchema.safeParse({ ...expense, paymentMethod: 'CREDITO', dueDate: '2026-11-18' })
      .success,
  ).toBe(true);
  expect(createExpensePaymentSchema('1').safeParse({ ...payment, paymentDate: '' }).success).toBe(
    false,
  );
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
