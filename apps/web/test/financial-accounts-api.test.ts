import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPayables,
  fetchPayablesAgingSummary,
} from '../src/features/payables/api/payables.api';
import {
  fetchReceivables,
  fetchReceivablesAgingSummary,
} from '../src/features/receivables/api/receivables.api';

afterEach(() => vi.unstubAllGlobals());

describe('contrato HTTP de cuentas por pagar y por cobrar', () => {
  it.each([
    ['payables', fetchPayables],
    ['receivables', fetchReceivables],
  ])('extrae los registros de GET %s', async (path, fetchAccounts) => {
    const list = { items: [{ id: 'account-1' }], total: 1, page: 1, pageSize: 20, totalPages: 1 };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: list }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchAccounts()).toEqual(list);
    const apiUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
    expect(fetchMock.mock.calls[0][0]).toBe(`${apiUrl}/${path}`);
  });

  it.each([
    ['payables', fetchPayablesAgingSummary],
    ['receivables', fetchReceivablesAgingSummary],
  ])('extrae el resumen de GET %s/aging-summary', async (path, fetchSummary) => {
    const summary = { totalPending: '150.00', totalCount: 1 };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: summary }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    expect(await fetchSummary()).toEqual(summary);
  });

  it('rechaza una respuesta exitosa sin datos para evitar un estado vacío engañoso', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(fetchPayables()).rejects.toThrow('no contiene datos válidos');
  });
});
