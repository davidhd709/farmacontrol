import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from '../src/utils/date-format';

describe('Formato de fechas dd/mm/aaaa', () => {
  it('muestra una fecha calendario sin correrla de día', () => {
    expect(formatDate('2026-11-02')).toBe('02/11/2026');
    expect(formatDate('2026-01-31')).toBe('31/01/2026');
  });

  it('convierte un instante al día de Bogotá, también cerca de medianoche', () => {
    expect(formatDate('2026-11-03T04:30:00.000Z')).toBe('02/11/2026');
    expect(formatDate('2026-11-03T05:00:00.000Z')).toBe('03/11/2026');
    expect(formatDateTime('2026-11-03T04:30:00.000Z')).toMatch(/^02\/11\/2026 11:30\s?p\.\s?m\.$/);
  });

  it('vacío o inválido se muestra como raya', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('no-es-fecha')).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });
});
