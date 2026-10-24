import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExpense, payExpense } from '../src/features/expenses/api/expenses.api';

afterEach(() => vi.unstubAllGlobals());

describe('API de gastos con idempotencia', () => {
  it('envía Idempotency-Key al crear un gasto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 'expense-1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createExpense(
      {
        categoryId: 'category-1',
        description: 'Conectividad',
        beneficiary: 'Operador',
        amount: '25000.00',
        expenseDate: '2026-10-01',
        paymentMethod: 'EFECTIVO',
      },
      'create-key-1',
    );

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Idempotency-Key')).toBe('create-key-1');
  });

  it('envía Idempotency-Key al registrar un pago', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 'expense-1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await payExpense(
      'expense-1',
      { amount: '10000.00', paymentDate: '2026-10-01', paymentMethod: 'EFECTIVO' },
      'payment-key-1',
    );

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Idempotency-Key')).toBe('payment-key-1');
  });
});
