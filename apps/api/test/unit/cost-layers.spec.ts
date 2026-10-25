import { describe, expect, it } from 'vitest';
import { consumeLayers, splitValue } from '../../src/modules/inventory/domain/services/cost-layers';
import { assertCostingMethodChangeDate } from '../../src/modules/company/domain/company-rules';

describe('capas de costo (F5)', () => {
  const layers = [
    { id: 'a', quantityRemaining: 3, valueRemainingCents: 1000n },
    { id: 'b', quantityRemaining: 2, valueRemainingCents: 900n },
  ];

  it('consume en orden y la salida que agota la capa se lleva el remanente exacto', () => {
    expect(consumeLayers(layers, 4)).toEqual({
      valueCents: 1450n,
      consumed: [
        { layerId: 'a', quantityBaseUnits: 3, valueCents: 1000n },
        { layerId: 'b', quantityBaseUnits: 1, valueCents: 450n },
      ],
    });
  });

  it('una salida parcial redondea half-up y las salidas suman lo que entró', () => {
    const first = consumeLayers(layers, 1);
    expect(first.valueCents).toBe(333n);
    const rest = consumeLayers(
      [{ id: 'a', quantityRemaining: 2, valueRemainingCents: 667n }, layers[1]],
      4,
    );
    expect(first.valueCents + rest.valueCents).toBe(1900n);
  });

  it('rechaza retirar más de lo que tienen las capas', () => {
    expect(() => consumeLayers(layers, 6)).toThrow(/5 unidades base/);
  });

  it('reparte un valor sin partes negativas y con suma exacta', () => {
    expect(splitValue(2n, [1, 1, 1, 1])).toEqual([1n, 0n, 1n, 0n]);
    expect(splitValue(1000n, [1, 2])).toEqual([333n, 667n]);
    const parts = splitValue(9999n, [7, 3, 11, 1]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(9999n);
    expect(parts.every((p) => p >= 0n)).toBe(true);
  });
});

describe('fecha de un cambio de método de costeo (F5)', () => {
  it('solo acepta el primer día de un mes posterior al actual', () => {
    expect(() => assertCostingMethodChangeDate('2026-11-01', '2026-10-25')).not.toThrow();
    expect(() => assertCostingMethodChangeDate('2027-01-01', '2026-10-25')).not.toThrow();
    expect(() => assertCostingMethodChangeDate('2026-10-01', '2026-10-01')).toThrow();
    expect(() => assertCostingMethodChangeDate('2026-10-25', '2026-10-25')).toThrow();
    expect(() => assertCostingMethodChangeDate('2026-11-02', '2026-10-25')).toThrow();
  });
});
