import { describe, expect, it } from 'vitest';
import { fromCents, lineAmounts, toCents } from '../src/utils/money';

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
