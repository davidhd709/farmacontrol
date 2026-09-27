import { describe, it, expect } from 'vitest';
import { calculateExpirationSeverity } from '../src/services/expiration-evaluator.service';

describe('Worker Expiration Evaluator Unit Test', () => {
  const referenceDate = new Date('2026-06-01T00:00:00Z');

  it('debe detectar lotes vencidos con daysRemaining <= 0', () => {
    const expired = new Date('2026-05-30T00:00:00Z');
    const res = calculateExpirationSeverity(expired, referenceDate);
    expect(res.severity).toBe('VENCIDO');
    expect(res.daysRemaining).toBeLessThanOrEqual(0);
  });

  it('debe detectar lotes en estado CRITICO cuando vencen en <= 30 días', () => {
    const critical = new Date('2026-06-20T00:00:00Z');
    const res = calculateExpirationSeverity(critical, referenceDate);
    expect(res.severity).toBe('CRITICO');
    expect(res.daysRemaining).toBe(19);
  });

  it('debe detectar lotes en ALERTA cuando vencen entre 31 y 60 días', () => {
    const alert = new Date('2026-07-15T00:00:00Z');
    const res = calculateExpirationSeverity(alert, referenceDate);
    expect(res.severity).toBe('ALERTA');
    expect(res.daysRemaining).toBe(44);
  });

  it('debe clasificar como NORMAL si vence en más de 90 días', () => {
    const normal = new Date('2026-12-01T00:00:00Z');
    const res = calculateExpirationSeverity(normal, referenceDate);
    expect(res.severity).toBe('NORMAL');
    expect(res.daysRemaining).toBeGreaterThan(90);
  });
});
