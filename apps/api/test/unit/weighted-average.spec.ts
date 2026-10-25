import { describe, expect, it } from 'vitest';
import {
  applyEntry,
  applyExit,
  exitValue,
  unitCost,
  valueAtUnitCost,
} from '../../src/modules/inventory/domain/services/weighted-average';

describe('Promedio ponderado móvil (ADR-005)', () => {
  it('promedia entradas a costos distintos', () => {
    const balance = applyEntry(
      applyEntry({ quantityBaseUnits: 0, valueCents: 0n }, 10, 1_000_000n),
      10,
      2_000_000n,
    );
    expect(balance).toEqual({ quantityBaseUnits: 20, valueCents: 3_000_000n });
    expect(unitCost(balance.valueCents, balance.quantityBaseUnits)).toBe('1500.000000');
  });

  it('redondea cada salida en centavos y la última se lleva el saldo exacto', () => {
    let balance = { quantityBaseUnits: 7, valueCents: 700_400n };
    const exits: bigint[] = [];
    for (const quantity of [1, 5, 1]) {
      const result = applyExit(balance, quantity);
      exits.push(result.valueCents);
      balance = result.balance;
    }
    expect(exits).toEqual([100_057n, 500_286n, 100_057n]);
    expect(exits.reduce((a, b) => a + b)).toBe(700_400n);
    expect(balance).toEqual({ quantityBaseUnits: 0, valueCents: 0n });
  });

  it('no permite retirar más de lo valorizado ni cantidades no enteras', () => {
    const balance = { quantityBaseUnits: 3, valueCents: 300n };
    expect(() => exitValue(balance, 4)).toThrow(/tiene 3 unidades base/);
    expect(() => exitValue(balance, 0)).toThrow(/entero positivo/);
    expect(() => exitValue(balance, 1.5)).toThrow(/entero positivo/);
    expect(() => applyEntry(balance, 1, -1n)).toThrow(/negativo/);
  });

  it('valora una cantidad a un costo unitario con seis decimales', () => {
    expect(valueAtUnitCost('1000.571429', 1)).toBe(100_057n);
    expect(valueAtUnitCost('800', 5)).toBe(400_000n);
    expect(valueAtUnitCost('0.333333', 3)).toBe(100n);
    expect(() => valueAtUnitCost('-5', 1)).toThrow(/inválido/);
  });
});
