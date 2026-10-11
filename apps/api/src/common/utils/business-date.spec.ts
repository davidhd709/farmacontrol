import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  businessDateOf,
  businessDayEnd,
  businessDayStart,
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
