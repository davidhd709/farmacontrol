import { describe, expect, it } from 'vitest';
import { formatCop, fromCents, lineAmounts, toCents } from '../src/utils/money';

describe('POS: importes en centavos', () => {
  it('conserva centavos al sumar y multiplicar precios decimales', () => {
    expect(toCents('0.10') + toCents('0.20')).toBe(30);
    expect(fromCents(lineAmounts(3, toCents('0.10'), 0, 0).total)).toBe(0.3);
    expect(toCents('1.005')).toBe(101);
  });
  it('redondea el impuesto a centavos después del descuento', () => {
    expect(lineAmounts(3, toCents('0.10'), toCents('0.05'), 19)).toEqual({
      subtotal: 25,
      taxAmount: 5,
      total: 30,
    });
  });
});

describe('formatCop: importes del API en unidades mayores', () => {
  it('formatea número y texto decimal sin errores de coma flotante', () => {
    expect(formatCop(12500)).toMatch(/12\.500/);
    expect(formatCop('12500.50')).toMatch(/12\.500,5/);
    expect(formatCop(0.1 + 0.2)).toMatch(/0,3/);
  });
  it('muestra — ante valores ausentes o inválidos', () => {
    expect(formatCop(null)).toBe('—');
    expect(formatCop(undefined)).toBe('—');
    expect(formatCop('abc')).toBe('—');
  });
});
