import { describe, expect, it } from 'vitest';
import { agingBreakdown, agingBucketOf, agingStartDate, daysOverdue } from './aging';

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

  it('cuenta desde el vencimiento con respaldo en la emisión, o siempre desde la emisión', () => {
    const issuedAt = new Date('2026-10-01T22:30:00Z'); // 17:30 en Bogotá: día 1
    const dueDate = new Date('2026-10-31T00:00:00Z');
    expect(agingStartDate('DUE_DATE_OR_ISSUE', { dueDate, issuedAt })).toEqual(dueDate);
    expect(agingStartDate('DUE_DATE_OR_ISSUE', { dueDate: null, issuedAt })).toEqual(new Date('2026-10-01T00:00:00Z'));
    expect(agingStartDate('ISSUE_DATE', { dueDate, issuedAt })).toEqual(new Date('2026-10-01T00:00:00Z'));
    // A las 21:00 de Bogotá ya es el día siguiente en UTC, pero se emitió ese día
    expect(agingStartDate('ISSUE_DATE', { dueDate, issuedAt: new Date('2026-10-02T02:00:00Z') })).toEqual(
      new Date('2026-10-01T00:00:00Z'),
    );
  });
});
