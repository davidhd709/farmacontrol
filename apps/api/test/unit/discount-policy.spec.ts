import { describe, it, expect } from 'vitest';
import { exceedsDiscountLimit } from '../../src/modules/sales/domain/discount-policy';

describe('Política de rebajas del cajero (AUD-011)', () => {
  const base = {
    quantityCommercial: 2,
    listUnitPrice: 1000,
    chargedUnitPrice: 1000,
    discount: 0,
    maxPct: 5,
  };

  it('permite exactamente el límite y rechaza un centavo más', () => {
    expect(exceedsDiscountLimit({ ...base, discount: 100 })).toBe(false); // 5 % de 2 000
    expect(exceedsDiscountLimit({ ...base, discount: 100.01 })).toBe(true);
  });

  it('suma la rebaja de precio y el descuento', () => {
    // precio 980 (−40) + descuento 61 = 101 > 100
    expect(exceedsDiscountLimit({ ...base, chargedUnitPrice: 980, discount: 61 })).toBe(true);
    expect(exceedsDiscountLimit({ ...base, chargedUnitPrice: 980, discount: 60 })).toBe(false);
  });

  it('cobrar por encima de la lista no es rebaja', () => {
    expect(exceedsDiscountLimit({ ...base, chargedUnitPrice: 1500 })).toBe(false);
  });

  it('funciona con cantidades fraccionarias', () => {
    // 1.5 × 1 000 = 1 500; 5 % = 75
    expect(exceedsDiscountLimit({ ...base, quantityCommercial: 1.5, discount: 75 })).toBe(false);
    expect(exceedsDiscountLimit({ ...base, quantityCommercial: 1.5, discount: 75.01 })).toBe(true);
  });
});
