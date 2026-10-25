import { describe, expect, it } from 'vitest';
import { lineAmounts } from '../src/utils/money';

describe('impuestos de una línea del POS (F6)', () => {
  it('redondea IVA e INC por separado, como el backend', () => {
    // 2 × $5.000 con IVA 19 %: 1.900 de impuesto
    expect(lineAmounts(2, 500000, 0, 19)).toEqual({
      subtotal: 1000000,
      taxAmount: 190000,
      total: 1190000,
    });
    // $5.000 con INC 8 %: 400
    expect(lineAmounts(1, 500000, 0, 0, 8)).toEqual({
      subtotal: 500000,
      taxAmount: 40000,
      total: 540000,
    });
    // Cada impuesto se redondea por su lado: 0,333 ¢ + 0,4 ¢ = 0 ¢, no 1 ¢
    expect(lineAmounts(1, 5, 0, 6.67, 8).taxAmount).toBe(0);
  });

  it('sin tarifas no agrega impuestos', () => {
    expect(lineAmounts(3, 1000, 500, 0)).toEqual({ subtotal: 2500, taxAmount: 0, total: 2500 });
  });
});
