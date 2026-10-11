import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  businessDayEnd,
  businessDayStart,
  businessToday,
} from '../src/utils/business-date';

describe('business-date (America/Bogota)', () => {
  it('usa el día de Bogotá aunque en UTC ya sea el día siguiente', () => {
    expect(businessToday(new Date('2026-10-11T04:30:00Z'))).toBe('2026-10-10');
    expect(businessToday(new Date('2027-01-01T01:00:00Z'))).toBe('2026-12-31');
  });

  it('suma días cruzando meses y años', () => {
    expect(addDaysToDate('2026-10-10', 30)).toBe('2026-11-09');
    expect(addDaysToDate('2026-12-15', 30)).toBe('2027-01-14');
  });

  it('delimita el día de negocio completo en Bogotá', () => {
    expect(new Date(businessDayStart('2026-10-10')).toISOString()).toBe('2026-10-10T05:00:00.000Z');
    expect(new Date(businessDayEnd('2026-10-10')).toISOString()).toBe('2026-10-11T04:59:59.999Z');
  });
});
