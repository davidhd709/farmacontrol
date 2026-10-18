import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadReportCsv,
  fetchTopProductsReport,
  fetchInventoryValuationReport,
} from '../src/features/reports/api/reports.api';
import { fetchAlertsSummary, fetchExpirations } from '../src/features/alerts/api/alerts.api';

afterEach(() => vi.unstubAllGlobals());
const apiUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
const jsonResponse = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('HTTP de reportes y alertas', () => {
  it('extrae el ranking y envía fechas, orden y límite al endpoint', async () => {
    const data = { items: [{ rank: 1, productCode: 'P-001' }], sortBy: 'value', limit: 5 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(data));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await fetchTopProductsReport({
        fromDate: '2026-10-01',
        toDate: '2026-10-18',
        sortBy: 'value',
        limit: 5,
      }),
    ).toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/reports/top-products?fromDate=2026-10-01&toDate=2026-10-18&sortBy=value&limit=5`,
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('extrae margen e incidencias del inventario sin recalcularlos', async () => {
    const data = { totalPotentialMargin: 3000000, productsWithValuationIssues: 2, items: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(data)));
    expect(await fetchInventoryValuationReport()).toEqual(data);
  });

  it('CSV solicita el endpoint con todos los mismos filtros y libera la URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('Código,Producto\nP1,Ejemplo', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn().mockReturnValue('blob:report');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await downloadReportCsv('top-products', {
      fromDate: '2026-10-01',
      toDate: '2026-10-18',
      sortBy: 'value',
      limit: 5,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/reports/top-products?fromDate=2026-10-01&toDate=2026-10-18&sortBy=value&limit=5&format=csv`,
      { method: 'GET', credentials: 'include' },
    );
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
  });

  it.each([
    ['alerts/summary', fetchAlertsSummary],
    ['alerts/expirations', fetchExpirations],
  ] as const)('extrae el envoltorio de %s', async (path, read) => {
    const data = { items: [], totalActive: 5 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(data));
    vi.stubGlobal('fetch', fetchMock);
    expect(await read()).toEqual(data);
    expect(fetchMock.mock.calls[0][0]).toBe(`${apiUrl}/${path}`);
  });
});
