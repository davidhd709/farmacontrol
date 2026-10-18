import { afterEach, expect, it, vi } from 'vitest';
import { registerReceivablePayment } from '../src/features/receivables/api/receivables.api';
import { registerPayablePayment } from '../src/features/payables/api/payables.api';
import { createExpense, payExpense } from '../src/features/expenses/api/expenses.api';

afterEach(() => vi.unstubAllGlobals());
it.each([
  [
    'receivables/account/payments',
    (key: string) =>
      registerReceivablePayment(
        'account',
        { amount: '0.30', paymentMethod: 'EFECTIVO', notes: null },
        key,
      ),
    { amount: '0.30', paymentMethod: 'EFECTIVO', notes: null },
  ],
  [
    'payables/account/payments',
    (key: string) =>
      registerPayablePayment(
        'account',
        { amount: '0.30', paymentMethod: 'EFECTIVO', notes: null },
        key,
      ),
    { amount: '0.30', paymentMethod: 'EFECTIVO', notes: null },
  ],
  [
    'expenses/account/payments',
    (key: string) =>
      payExpense(
        'account',
        { amount: '0.30', paymentMethod: 'EFECTIVO', paymentDate: '2026-10-18', notes: undefined },
        key,
      ),
    { amount: '0.30', paymentMethod: 'EFECTIVO', paymentDate: '2026-10-18' },
  ],
  [
    'expenses',
    (key: string) =>
      createExpense(
        {
          categoryId: 'category',
          beneficiary: 'Proveedor',
          description: 'Servicio',
          amount: '0.30',
          expenseDate: '2026-10-18',
          paymentMethod: 'EFECTIVO',
        },
        key,
      ),
    {
      categoryId: 'category',
      beneficiary: 'Proveedor',
      description: 'Servicio',
      amount: '0.30',
      expenseDate: '2026-10-18',
      paymentMethod: 'EFECTIVO',
    },
  ],
])('POST %s conserva cuerpo y clave de idempotencia en reintento', async (path, send, payload) => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Sin conexión'))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { id: 'account' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  vi.stubGlobal('fetch', fetch);
  await expect(send('same-key')).rejects.toThrow();
  await send('same-key');
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [url, init] of fetch.mock.calls) {
    expect(url).toContain(`/api/v1/${path}`);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('same-key');
    expect(JSON.parse(init.body)).toEqual(payload);
  }
});
