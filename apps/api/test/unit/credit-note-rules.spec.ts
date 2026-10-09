import { describe, it, expect } from 'vitest';
import {
  prorateCents,
  resolveRefundMethod,
  sortAllocationsFefo,
  splitReturnAcrossLots,
} from '../../src/modules/sales/domain/credit-note-rules';

describe('credit-note-rules', () => {
  describe('prorateCents', () => {
    it('calcula la parte proporcional exacta', () => {
      expect(prorateCents(1800000n, 1, 2)).toBe(900000n);
    });

    it('redondea half-up al centavo', () => {
      // 1000 centavos / 3 = 333.33 -> 333; 2000 / 3 = 666.67 -> 667
      expect(prorateCents(1000n, 1, 3)).toBe(333n);
      expect(prorateCents(1000n, 2, 3)).toBe(667n);
      expect(prorateCents(1n, 1, 2)).toBe(1n);
    });

    it('rechaza un total de cero', () => {
      expect(() => prorateCents(100n, 1, 0)).toThrow();
    });
  });

  describe('resolveRefundMethod', () => {
    it('devuelve por el mismo medio de la venta cuando no se indica', () => {
      expect(resolveRefundMethod('EFECTIVO')).toBe('EFECTIVO');
      expect(resolveRefundMethod('TRANSFERENCIA')).toBe('TRANSFERENCIA');
      expect(resolveRefundMethod('CREDITO')).toBe('CREDITO_CARTERA');
    });

    it('respeta un medio soportado y rechaza los no soportados', () => {
      expect(resolveRefundMethod('CREDITO', 'EFECTIVO')).toBe('EFECTIVO');
      expect(resolveRefundMethod('EFECTIVO', 'SALDO_A_FAVOR')).toBeNull();
    });
  });

  describe('splitReturnAcrossLots', () => {
    const allocations = sortAllocationsFefo([
      { lotId: 'late', quantityBaseUnits: 2, lot: { expirationDate: new Date('2028-12-31') } },
      { lotId: 'soon', quantityBaseUnits: 1, lot: { expirationDate: new Date('2027-06-30') } },
    ]);

    it('reparte en orden FEFO sin exceder lo que entregó cada lote', () => {
      expect(splitReturnAcrossLots(allocations, 0, 3)).toEqual([
        { lotId: 'soon', quantityBaseUnits: 1 },
        { lotId: 'late', quantityBaseUnits: 2 },
      ]);
    });

    it('continúa después de las unidades ya devueltas', () => {
      expect(splitReturnAcrossLots(allocations, 1, 1)).toEqual([
        { lotId: 'late', quantityBaseUnits: 1 },
      ]);
      expect(splitReturnAcrossLots(allocations, 2, 1)).toEqual([
        { lotId: 'late', quantityBaseUnits: 1 },
      ]);
    });

    it('usa un único tramo sin lote para productos sin control de lote', () => {
      expect(splitReturnAcrossLots([], 0, 4)).toEqual([{ lotId: null, quantityBaseUnits: 4 }]);
    });

    it('falla si la devolución supera lo asignado', () => {
      expect(() => splitReturnAcrossLots(allocations, 2, 2)).toThrow();
    });
  });
});
