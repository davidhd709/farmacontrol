import { describe, expect, it } from 'vitest';
import { calculateTaxIncludedLine } from '../../src/modules/accounting/domain/tax-included-calculation';

describe('calculateTaxIncludedLine', () => {
  it('desglosa IVA incluido sobre el importe neto después del descuento', () => {
    expect(
      calculateTaxIncludedLine({
        unitPrice: '119.00',
        quantity: '2',
        discount: '23.80',
        treatment: 'GRAVADO',
        rate: '19',
      }),
    ).toEqual({
      treatment: 'GRAVADO',
      rate: '19.00',
      gross: '238.00',
      discount: '23.80',
      taxableBase: '180.00',
      tax: '34.20',
      total: '214.20',
    });
  });

  it('redondea half-up la cantidad fraccionaria y conserva suma exacta', () => {
    expect(
      calculateTaxIncludedLine({
        unitPrice: '0.05',
        quantity: '0.1000',
        discount: '0',
        treatment: 'GRAVADO',
        rate: '19',
      }),
    ).toEqual({
      treatment: 'GRAVADO',
      rate: '19.00',
      gross: '0.01',
      discount: '0.00',
      taxableBase: '0.01',
      tax: '0.00',
      total: '0.01',
    });
  });

  it.each(['EXENTO', 'EXCLUIDO', 'NO_APLICA'] as const)(
    'no genera impuesto para %s',
    (treatment) => {
      expect(
        calculateTaxIncludedLine({
          unitPrice: '100.00',
          quantity: '1.5',
          discount: '10',
          treatment,
          rate: '0',
        }),
      ).toEqual({
        treatment,
        rate: '0.00',
        gross: '150.00',
        discount: '10.00',
        taxableBase: '140.00',
        tax: '0.00',
        total: '140.00',
      });
    },
  );

  it('admite descuento total sin importe negativo', () => {
    const result = calculateTaxIncludedLine({
      unitPrice: '100',
      quantity: '1',
      discount: '100',
      treatment: 'GRAVADO',
      rate: '19',
    });
    expect(result.total).toBe('0.00');
    expect(result.tax).toBe('0.00');
  });

  it.each([
    { unitPrice: '1.001' },
    { unitPrice: '-1' },
    { unitPrice: '0' },
    { quantity: '0' },
    { quantity: '1.00001' },
    { discount: '119.01' },
    { rate: '19.001' },
    { treatment: 'GRAVADO', rate: '0' },
    { treatment: 'EXCLUIDO', rate: '19' },
    { unitPrice: '999999999999999999.99', quantity: '2' },
  ])('rechaza entradas inválidas y overflow: %j', (overrides) => {
    expect(() =>
      calculateTaxIncludedLine({
        unitPrice: '119',
        quantity: '1',
        discount: '0',
        treatment: 'GRAVADO',
        rate: '19',
        ...overrides,
      } as Parameters<typeof calculateTaxIncludedLine>[0]),
    ).toThrow();
  });
});
