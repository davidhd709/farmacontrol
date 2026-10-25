import { describe, expect, it } from 'vitest';
import { planFefoAllocation } from '../../src/modules/sales/domain/plan-fefo-allocation';
import { saleBaseUnits } from '../../src/modules/sales/domain/sale-base-units';

const lots = Object.freeze([
  Object.freeze({ id: 'first', current_quantity: 10 }),
  Object.freeze({ id: 'second', current_quantity: 20 }),
  Object.freeze({ id: 'third', current_quantity: 30 }),
]);

describe('planFefoAllocation', () => {
  it('reparte sobre varios lotes en el orden recibido sin modificar las entradas', () => {
    expect(planFefoAllocation(lots, 35)).toEqual({
      allocations: [
        { lot: lots[0], quantityBaseUnits: 10 },
        { lot: lots[1], quantityBaseUnits: 20 },
        { lot: lots[2], quantityBaseUnits: 5 },
      ],
      shortfallBaseUnits: 0,
    });
    expect(lots.map((lot) => lot.current_quantity)).toEqual([10, 20, 30]);
  });

  it('termina en el lote exacto sin asignaciones de cero', () => {
    expect(planFefoAllocation(lots, 10)).toEqual({
      allocations: [{ lot: lots[0], quantityBaseUnits: 10 }],
      shortfallBaseUnits: 0,
    });
  });

  it('devuelve asignaciones parciales y faltante', () => {
    const plan = planFefoAllocation(lots, 70);
    expect(plan.shortfallBaseUnits).toBe(10);
    expect(plan.allocations.map((a) => a.quantityBaseUnits)).toEqual([10, 20, 30]);
  });

  it('maneja lotes agotados por líneas anteriores y la ausencia de lotes', () => {
    expect(planFefoAllocation([{ id: 'empty', current_quantity: 0 }, lots[1]], 5)).toEqual({
      allocations: [{ lot: lots[1], quantityBaseUnits: 5 }],
      shortfallBaseUnits: 0,
    });
    expect(planFefoAllocation([], 5)).toEqual({ allocations: [], shortfallBaseUnits: 5 });
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rechaza requerido inválido: %s',
    (required) => expect(() => planFefoAllocation(lots, required)).toThrow('entero positivo'),
  );
});

describe('saleBaseUnits compartida por confirmación y vista previa', () => {
  it('convierte presentaciones y tolera el error de representación decimal existente', () => {
    expect(saleBaseUnits(2.5, 10)).toBe(25);
    expect(saleBaseUnits(0.14, 100)).toBe(14);
  });

  it.each([0, -1, NaN, Infinity, 0.01, Number.MAX_SAFE_INTEGER + 1])(
    'rechaza cantidades inválidas o que no dan unidades base enteras: %s',
    (quantity) => expect(() => saleBaseUnits(quantity, 1)).toThrow(),
  );
});
