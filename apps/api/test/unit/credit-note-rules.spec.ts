import { describe, it, expect } from 'vitest';
import {
  creditAmountsForLine,
  splitProportionally,
  splitReturnAcrossLots,
} from '../../src/modules/sales/domain/credit-note-rules';

describe('Reglas de notas crédito (AUD-007)', () => {
  const line = { subtotal: 290000n, tax: 0n }; // 2 900.00 neto de descuento

  it('devuelve el neto proporcional y, al completar la línea, el residuo exacto', () => {
    const first = creditAmountsForLine({
      soldHundredths: 300n,
      previouslyReturnedHundredths: 0n,
      returnedHundredths: 100n,
      line,
      previouslyCredited: { subtotal: 0n, tax: 0n },
    });
    expect(first.subtotal).toBe(96667n);

    const rest = creditAmountsForLine({
      soldHundredths: 300n,
      previouslyReturnedHundredths: 100n,
      returnedHundredths: 200n,
      line,
      previouslyCredited: first,
    });
    expect(first.subtotal + rest.subtotal).toBe(290000n);
  });

  it('reparte entre lotes sin superar lo que salió de cada uno', () => {
    expect(
      splitReturnAcrossLots(3, [
        { lotId: 'a', availableBaseUnits: 1 },
        { lotId: 'b', availableBaseUnits: 5 },
      ]),
    ).toEqual([
      { lotId: 'a', baseUnits: 1 },
      { lotId: 'b', baseUnits: 2 },
    ]);
    expect(() => splitReturnAcrossLots(4, [{ lotId: 'a', availableBaseUnits: 3 }])).toThrow();
  });

  it('divide montos en porciones cuya suma es exacta', () => {
    const parts = splitProportionally(100n, [1n, 1n, 1n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(100n);
    expect(parts).toEqual([33n, 33n, 34n]);
  });
});
