import { describe, expect, it } from 'vitest';
import { centsToNumber, moneyToCents } from '../../src/modules/reports/domain/report-money';

describe('report-money: aritmética exacta desde texto decimal', () => {
  it('suma decimales y grandes importes sin pérdida intermedia', () => {
    expect(centsToNumber(moneyToCents('0.10') + moneyToCents('0.20'))).toBe(0.3);
    expect(moneyToCents('99999999999999.99') + moneyToCents('0.01')).toBe(10000000000000000n);
  });
  it('admite cero, enteros, un decimal y negativos', () => {
    expect(moneyToCents('0')).toBe(0n);
    expect(moneyToCents('10')).toBe(1000n);
    expect(moneyToCents('0.2')).toBe(20n);
    expect(moneyToCents('-0.10')).toBe(-10n);
    expect(centsToNumber(-20n)).toBe(-0.2);
  });
  it.each(['0.001', 'NaN', 'Infinity', '1e2', ''])('rechaza importe no válido %s', (text) => {
    expect(() => moneyToCents(text)).toThrow('Importe monetario inválido');
  });
});
