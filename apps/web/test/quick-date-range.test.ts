import { describe, expect, it } from 'vitest';
import { localIsoDate, quickRange } from '../src/components/QuickDateRange';

describe('Rangos rápidos de fecha', () => {
  // 10 de octubre de 2026, 20:30 en Colombia (01:30 UTC del día 11)
  const evening = new Date(2026, 9, 10, 20, 30);

  it('usa la fecha local: "Hoy" no salta al día siguiente en la noche', () => {
    expect(localIsoDate(evening)).toBe('2026-10-10');
    expect(quickRange('today', evening)).toEqual({ from: '2026-10-10', to: '2026-10-10' });
  });

  it('calcula este mes, el mes anterior y el año a la fecha', () => {
    expect(quickRange('this_month', evening)).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(quickRange('last_month', evening)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(quickRange('ytd', evening)).toEqual({ from: '2026-01-01', to: '2026-10-10' });
    expect(quickRange('last_month', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});
