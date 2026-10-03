import { describe, it, expect } from 'vitest';
import {
  parseMoneyToCents,
  centsToMoneyString,
  calculateNewCashBalanceCents,
  isCashIncome,
  isCashExpense,
  validateCashMovementType,
} from '../../src/modules/cash/domain/cash-rules';
import {
  InsufficientCashBalanceException,
  InvalidCashAmountException,
  InvalidCashMovementTypeException,
} from '../../src/modules/cash/domain/cash.exceptions';

describe('Cash Rules & Cents Precision (Domain Unit Tests)', () => {
  describe('parseMoneyToCents', () => {
    it('convierte números y cadenas válidas a centavos exactos en bigint', () => {
      expect(parseMoneyToCents('100.50')).toBe(10050n);
      expect(parseMoneyToCents('0.01')).toBe(1n);
      expect(parseMoneyToCents('0')).toBe(0n);
      expect(parseMoneyToCents(50000)).toBe(5000000n);
      expect(parseMoneyToCents(1234.56)).toBe(123456n);
    });

    it('rechaza montos negativos o no numéricos', () => {
      expect(() => parseMoneyToCents('-10.00')).toThrow(InvalidCashAmountException);
      expect(() => parseMoneyToCents(-5)).toThrow(InvalidCashAmountException);
      expect(() => parseMoneyToCents('abc')).toThrow(InvalidCashAmountException);
      expect(() => parseMoneyToCents(NaN)).toThrow(InvalidCashAmountException);
    });
  });

  describe('centsToMoneyString', () => {
    it('formatea centavos exactos a cadena con 2 decimales', () => {
      expect(centsToMoneyString(10050n)).toBe('100.50');
      expect(centsToMoneyString(1n)).toBe('0.01');
      expect(centsToMoneyString(0n)).toBe('0.00');
      expect(centsToMoneyString(5000000n)).toBe('50000.00');
    });
  });

  describe('isCashIncome e isCashExpense', () => {
    it('clasifica correctamente los tipos de movimiento de caja', () => {
      expect(isCashIncome('INGRESO_VENTA')).toBe(true);
      expect(isCashIncome('INGRESO_MANUAL')).toBe(true);
      expect(isCashIncome('EGRESO_MANUAL')).toBe(false);

      expect(isCashExpense('EGRESO_MANUAL')).toBe(true);
      expect(isCashExpense('EGRESO_PAGO_PROVEEDOR')).toBe(true);
      expect(isCashExpense('INGRESO_VENTA')).toBe(false);
    });
  });

  describe('validateCashMovementType', () => {
    it('valida tipos permitidos y rechaza tipos desconocidos', () => {
      expect(validateCashMovementType('INGRESO_VENTA')).toBe('INGRESO_VENTA');
      expect(validateCashMovementType('EGRESO_PAGO_PROVEEDOR')).toBe('EGRESO_PAGO_PROVEEDOR');
      expect(() => validateCashMovementType('OTRO_TIPO')).toThrow(InvalidCashMovementTypeException);
    });
  });

  describe('calculateNewCashBalanceCents', () => {
    it('suma correctamente en ingresos de caja', () => {
      const res = calculateNewCashBalanceCents(5000000n, 'INGRESO_VENTA', 2500000n);
      expect(res.balanceBefore).toBe(5000000n);
      expect(res.balanceAfter).toBe(7500000n);
    });

    it('resta correctamente en egresos de caja', () => {
      const res = calculateNewCashBalanceCents(5000000n, 'EGRESO_MANUAL', 2000000n);
      expect(res.balanceBefore).toBe(5000000n);
      expect(res.balanceAfter).toBe(3000000n);
    });

    it('lanza InsufficientCashBalanceException si el egreso supera el saldo en caja', () => {
      expect(() =>
        calculateNewCashBalanceCents(1000000n, 'EGRESO_MANUAL', 2000000n),
      ).toThrow(InsufficientCashBalanceException);
    });

    it('rechaza montos menores o iguales a cero', () => {
      expect(() =>
        calculateNewCashBalanceCents(5000000n, 'INGRESO_MANUAL', 0n),
      ).toThrow(InvalidCashAmountException);
    });
  });
});
