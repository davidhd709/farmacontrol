import { describe, expect, it } from 'vitest';
import {
  assertValidNit,
  nitCheckDigit,
  validatePolicyValues,
} from '../../src/modules/company/domain/company-rules';

describe('Reglas de empresa (ADR-006)', () => {
  it('calcula el dígito de verificación del NIT con el algoritmo de la DIAN', () => {
    expect(nitCheckDigit('800197268')).toBe('4'); // DIAN
    expect(nitCheckDigit('890903938')).toBe('8');
    expect(nitCheckDigit('899999068')).toBe('1');
  });

  it('rechaza un dígito de verificación que no corresponde y NIT mal formados', () => {
    expect(() => assertValidNit('800197268', '5')).toThrow(/debería ser 4/);
    expect(() => nitCheckDigit('80019726-8')).toThrow(/entre 5 y 15 dígitos/);
    expect(() => nitCheckDigit('123')).toThrow(/entre 5 y 15 dígitos/);
  });

  it('valida la política contable y admite los tres métodos de costeo', () => {
    const valid = {
      costingMethod: 'WEIGHTED_AVERAGE',
      openingCostSource: 'CATALOG',
      purchaseReturnVariancePurpose: 'INVENTORY_COST_VARIANCE',
      bonusUnitsTreatment: 'ZERO_COST_IN_AVERAGE',
    };
    expect(validatePolicyValues(valid)).toEqual(valid);
    // F5: los tres métodos están disponibles; LIFO no es un método admitido
    expect(validatePolicyValues({ ...valid, costingMethod: 'FIFO' }).costingMethod).toBe('FIFO');
    expect(validatePolicyValues({ ...valid, costingMethod: 'SPECIFIC_LOT' }).costingMethod).toBe(
      'SPECIFIC_LOT',
    );
    expect(() => validatePolicyValues({ ...valid, costingMethod: 'LIFO' })).toThrow(
      /Método de costeo no válido/,
    );
    expect(() => validatePolicyValues({ ...valid, openingCostSource: 'ZERO' })).toThrow(
      /Costo de apertura no válido/,
    );
  });
});
