import { describe, expect, it } from 'vitest';
import { localIsoDate, quickRange } from '../src/components/QuickDateRange';
import { businessYear, calendarMonthBounds } from '../src/utils/business-date';

describe('Rangos rápidos de fecha', () => {
  // 10 de octubre de 2026, 20:30 en Colombia (01:30 UTC del día 11)
  const evening = new Date('2026-10-10T20:30:00-05:00');

  it('usa la fecha local: "Hoy" no salta al día siguiente en la noche', () => {
    expect(localIsoDate(evening)).toBe('2026-10-10');
    expect(quickRange('today', evening)).toEqual({ from: '2026-10-10', to: '2026-10-10' });
  });

  it('calcula este mes, el mes anterior y el año a la fecha', () => {
    expect(quickRange('this_month', evening)).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(quickRange('last_month', evening)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(quickRange('ytd', evening)).toEqual({ from: '2026-01-01', to: '2026-10-10' });
    expect(quickRange('last_month', new Date('2026-01-15T12:00:00-05:00'))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });
});

describe('Fechas de Bogotá alrededor de la medianoche, sin depender de la zona del equipo', () => {
  it('el último minuto del mes sigue en el mes; el primero del siguiente ya cambia', () => {
    const lastMinute = new Date('2026-10-31T23:59:00-05:00');
    const firstMinute = new Date('2026-11-01T00:00:00-05:00');
    expect(quickRange('today', lastMinute)).toEqual({ from: '2026-10-31', to: '2026-10-31' });
    expect(quickRange('this_month', lastMinute)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(quickRange('this_month', firstMinute)).toEqual({ from: '2026-11-01', to: '2026-11-01' });
    expect(quickRange('last_month', firstMinute)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('el 31 de diciembre a las 23:30 sigue en el año; el año a la fecha no salta', () => {
    const newYearsEve = new Date('2026-12-31T23:30:00-05:00');
    expect(localIsoDate(newYearsEve)).toBe('2026-12-31');
    expect(businessYear(newYearsEve)).toBe(2026);
    expect(quickRange('ytd', newYearsEve)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('calcula los límites de mes por calendario, incluido febrero bisiesto', () => {
    expect(calendarMonthBounds('2028-03-15', -1)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(calendarMonthBounds('2026-01-10', -1)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(calendarMonthBounds('2026-11-30')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
});
