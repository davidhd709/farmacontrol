import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPayableStatement } from '../src/features/payables/api/payables.api';
import {
  fetchReceivables,
  fetchReceivablesAgingSummary,
} from '../src/features/receivables/api/receivables.api';

afterEach(() => vi.unstubAllGlobals());

describe('contrato HTTP de cuentas por pagar y por cobrar', () => {
  it.each([
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
    ['receivables', fetchReceivablesAgingSummary],
  ])('extrae el resumen de GET %s/aging-summary', async (_path, fetchSummary) => {
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

    await expect(fetchPayableStatement({ supplierId: 'sup-1' })).rejects.toThrow(
      'no contiene datos válidos',
    );
  });

  it('consulta el estado de cuenta de cuentas por pagar con proveedor, fechas y saldadas', async () => {
    const statement = { items: [], aging: { totalPending: '0.00', totalCount: 0 } };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: statement }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await fetchPayableStatement({
        supplierId: 'sup-1',
        fromDate: '2026-10-01',
        toDate: '2026-10-31',
        includePaid: true,
      }),
    ).toEqual(statement);
    const apiUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${apiUrl}/payables/statement?supplierId=sup-1&fromDate=2026-10-01&toDate=2026-10-31&includePaid=true`,
    );
  });
});
