import { describe, expect, it } from 'vitest';
import {
  calculateNewBalanceCents,
  centsToMoneyString,
  isOutflow,
  parseMoneyToCents,
  TreasuryValidationError,
  validateAccountName,
  validateAccountNumber,
  validateAccountType,
  validateBankName,
} from '../../src/modules/treasury/domain/treasury-rules';

describe('Treasury Rules & Decimal Arithmetic (Slice 11.4)', () => {
  describe('parseMoneyToCents and centsToMoneyString', () => {
    it('convierte correctamente cadenas decimales a centavos enteros', () => {
      expect(parseMoneyToCents('100.50', 'Test')).toBe(10050n);
      expect(parseMoneyToCents('0', 'Test')).toBe(0n);
      expect(parseMoneyToCents('0.00', 'Test')).toBe(0n);
      expect(parseMoneyToCents('5000000.25', 'Test')).toBe(500000025n);
    });

    it('formatea centavos enteros a formato monetario estándar de dos decimales', () => {
      expect(centsToMoneyString(10050n)).toBe('100.50');
      expect(centsToMoneyString(0n)).toBe('0.00');
      expect(centsToMoneyString(5n)).toBe('0.05');
      expect(centsToMoneyString(500000025n)).toBe('5000000.25');
    });

    it('rechaza valores no numéricos o con más de dos decimales', () => {
      expect(() => parseMoneyToCents('abc', 'Importe')).toThrow(TreasuryValidationError);
      expect(() => parseMoneyToCents('10.555', 'Importe')).toThrow(TreasuryValidationError);
      expect(() => parseMoneyToCents('-50.00', 'Importe')).toThrow(TreasuryValidationError);
    });
  });

  describe('isOutflow', () => {
    it('clasifica correctamente los egresos vs ingresos bancarios', () => {
      expect(isOutflow('DEPOSIT')).toBe(false);
      expect(isOutflow('TRANSFER_IN')).toBe(false);
      expect(isOutflow('ADJUSTMENT')).toBe(false);
      expect(isOutflow('WITHDRAWAL')).toBe(true);
      expect(isOutflow('TRANSFER_OUT')).toBe(true);
      expect(isOutflow('FEE')).toBe(true);
    });
  });

  describe('calculateNewBalanceCents', () => {
    it('suma depósitos e ingresos por transferencia al saldo existente', () => {
      const res1 = calculateNewBalanceCents(100000n, 'DEPOSIT', 50000n);
      expect(res1.balanceBefore).toBe(100000n);
      expect(res1.balanceAfter).toBe(150000n);

      const res2 = calculateNewBalanceCents(100000n, 'TRANSFER_IN', 25000n);
      expect(res2.balanceAfter).toBe(125000n);
    });

    it('resta retiros, transferencias salientes y comisiones bancarias', () => {
      const res = calculateNewBalanceCents(100000n, 'WITHDRAWAL', 40000n);
      expect(res.balanceBefore).toBe(100000n);
      expect(res.balanceAfter).toBe(60000n);

      const resFee = calculateNewBalanceCents(60000n, 'FEE', 10000n);
      expect(resFee.balanceAfter).toBe(50000n);
    });

    it('impide sobregiros cuando el importe supera el saldo disponible', () => {
      expect(() => calculateNewBalanceCents(50000n, 'WITHDRAWAL', 60000n, false)).toThrow(
        /Fondos insuficientes/,
      );
    });

    it('rechaza importes menores o iguales a cero', () => {
      expect(() => calculateNewBalanceCents(50000n, 'DEPOSIT', 0n)).toThrow(
        TreasuryValidationError,
      );
    });
  });

  describe('validaciones de cuenta bancaria', () => {
    it('valida tipo de cuenta permitido', () => {
      expect(validateAccountType('AHORROS')).toBe('AHORROS');
      expect(validateAccountType('CORRIENTE')).toBe('CORRIENTE');
      expect(validateAccountType('DIGITAL')).toBe('DIGITAL');
      expect(() => validateAccountType('INVERSION')).toThrow(TreasuryValidationError);
    });

    it('valida nombre de banco, número y descripción', () => {
      expect(validateBankName(' Bancolombia ')).toBe('Bancolombia');
      expect(() => validateBankName('')).toThrow(TreasuryValidationError);

      expect(validateAccountNumber(' 123456789 ')).toBe('123456789');
      expect(() => validateAccountNumber('')).toThrow(TreasuryValidationError);

      expect(validateAccountName(' Cuenta Nómina ')).toBe('Cuenta Nómina');
      expect(() => validateAccountName('')).toThrow(TreasuryValidationError);
    });
  });
});
