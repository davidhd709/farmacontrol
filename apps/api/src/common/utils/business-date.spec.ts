import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  businessDateOf,
  businessDayEnd,
  businessDayStart,
  businessToday,
  businessYearMonth,
} from './business-date';

describe('fechas de negocio Bogotá', () => {
  it('mantiene el 10 de octubre a las 23:30 aunque UTC ya sea 11', () => {
    const instant = new Date('2026-10-10T23:30:00-05:00');
    expect(businessDateOf(instant)).toBe('2026-10-10');
    expect(businessYearMonth(instant)).toEqual({ year: 2026, month: 10 });
    expect(businessDayStart('2026-10-10').toISOString()).toBe('2026-10-10T05:00:00.000Z');
    expect(businessDayEnd('2026-10-10').toISOString()).toBe('2026-10-11T04:59:59.999Z');
  });

  it('mantiene 2026 al cierre de diciembre y suma días de calendario', () => {
    const instant = new Date('2026-12-31T20:00:00-05:00');
    expect(businessDateOf(instant)).toBe('2026-12-31');
    expect(businessYearMonth(instant)).toEqual({ year: 2026, month: 12 });
    expect(addCalendarDays('2026-12-31', 30)).toBe('2027-01-30');
  });
});

describe('businessDayStart/businessDayEnd con instantes ISO', () => {
  it('respeta un instante ISO completo enviado por el cliente', () => {
    expect(businessDayStart('2026-10-10T00:00:00.000-05:00').toISOString()).toBe(
      '2026-10-10T05:00:00.000Z',
    );
    expect(businessDayEnd('2026-10-10T23:59:59.999-05:00').toISOString()).toBe(
      '2026-10-11T04:59:59.999Z',
    );
  });
});

describe('fechas de negocio alrededor de la medianoche', () => {
  it('23:59 y 00:00 de Bogotá caen en días distintos aunque UTC no cambie de día entre ellos', () => {
    expect(businessToday(new Date('2026-11-02T23:59:59-05:00'))).toBe('2026-11-02');
    expect(businessToday(new Date('2026-11-03T00:00:00-05:00'))).toBe('2026-11-03');
    // 19:00 de Bogotá: UTC ya es el día siguiente, el negocio no
    expect(businessToday(new Date('2026-11-03T00:00:00Z'))).toBe('2026-11-02');
  });

  it('un instante de las 23:59 entra en el filtro del día y uno de las 00:00 en el siguiente', () => {
    const lastMinute = new Date('2026-11-02T23:59:00-05:00').getTime();
    const midnight = new Date('2026-11-03T00:00:00-05:00').getTime();
    expect(lastMinute).toBeLessThanOrEqual(businessDayEnd('2026-11-02').getTime());
    expect(midnight).toBeGreaterThan(businessDayEnd('2026-11-02').getTime());
    expect(midnight).toBe(businessDayStart('2026-11-03').getTime());
  });

  it('el cambio de año se decide en Bogotá', () => {
    expect(businessYearMonth(new Date('2027-01-01T03:00:00Z'))).toEqual({ year: 2026, month: 12 });
    expect(businessYearMonth(new Date('2027-01-01T05:00:00Z'))).toEqual({ year: 2027, month: 1 });
  });
});
