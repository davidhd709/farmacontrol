import { describe, expect, it } from 'vitest';
import { agingBreakdown, agingBucketOf, daysOverdue } from './aging';

describe('edades de cartera y cuentas por pagar', () => {
  it('clasifica en Corriente (hasta 30 días), 31–60, 61–90 y más de 90', () => {
    expect(agingBucketOf(-5)).toBe('CORRIENTE');
    expect(agingBucketOf(0)).toBe('CORRIENTE');
    expect(agingBucketOf(30)).toBe('CORRIENTE');
    expect(agingBucketOf(31)).toBe('DIAS_31_60');
    expect(agingBucketOf(60)).toBe('DIAS_31_60');
    expect(agingBucketOf(61)).toBe('DIAS_61_90');
    expect(agingBucketOf(90)).toBe('DIAS_61_90');
    expect(agingBucketOf(91)).toBe('MAS_90');
  });

  it('cuenta los días vencidos entre fechas calendario', () => {
    const today = new Date('2026-11-01T00:00:00Z');
    expect(daysOverdue(new Date('2026-10-01T00:00:00Z'), today)).toBe(31);
    expect(daysOverdue(new Date('2026-11-15T00:00:00Z'), today)).toBe(-14);
  });

  it('suma saldos exactos por rango e ignora los saldados', () => {
    const result = agingBreakdown([
      { balanceCents: 1050n, bucket: 'CORRIENTE' },
      { balanceCents: 1n, bucket: 'CORRIENTE' },
      { balanceCents: 0n, bucket: 'MAS_90' },
      { balanceCents: 250000n, bucket: 'DIAS_61_90' },
    ]);
    expect(result.current).toEqual({ amount: '10.51', count: 2 });
    expect(result.daysOver90).toEqual({ amount: '0.00', count: 0 });
    expect(result.days61To90).toEqual({ amount: '2500.00', count: 1 });
    expect(result.totalPending).toBe('2510.51');
    expect(result.totalCount).toBe(3);
  });
});
