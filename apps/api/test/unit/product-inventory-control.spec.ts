import { describe, it, expect } from 'vitest';
import { SECTOR_PROFILE_RULES } from '@farmacia/contracts';
import { Product } from '../../src/modules/catalog/domain/entities/product.entity';
import { ProductInventoryControlModeException } from '../../src/modules/catalog/domain/exceptions/product.exceptions';

describe('Product: modos de control por perfil sectorial', () => {
  const profile = SECTOR_PROFILE_RULES.PHARMACY;
  const base = {
    categoryId: 'cat-1',
    code: 'MED-001',
    name: 'Acetaminofén 500 mg',
    basePrice: 200,
  };

  it('usa LOT_EXPIRY por defecto en PHARMACY', () => {
    expect(Product.create(base, profile).inventoryControlMode).toBe('LOT_EXPIRY');
  });

  it.each(['SERVICE', 'SIMPLE', 'LOT', 'LOT_EXPIRY', 'SERIAL'] as const)(
    'acepta el modo explícito %s permitido por el perfil',
    (inventoryControlMode) => {
      expect(Product.create({ ...base, inventoryControlMode }, profile).inventoryControlMode).toBe(
        inventoryControlMode,
      );
    },
  );

  it('rechaza un modo que el perfil no permite', () => {
    expect(() =>
      Product.create(
        { ...base, inventoryControlMode: 'SIMPLE' },
        {
          ...profile,
          allowedControlModes: ['LOT_EXPIRY'],
        },
      ),
    ).toThrow(ProductInventoryControlModeException);
  });

  it('exige LOT_EXPIRY para productos con fórmula al crear y editar', () => {
    expect(() =>
      Product.create(
        { ...base, inventoryControlMode: 'SIMPLE', prescriptionRequired: true },
        profile,
      ),
    ).toThrow(/fórmula médica.*LOT_EXPIRY/i);

    const product = Product.create(base, profile);
    expect(() =>
      product.update({ inventoryControlMode: 'LOT', prescriptionRequired: true }, profile),
    ).toThrow(/fórmula médica.*LOT_EXPIRY/i);
    expect(product.inventoryControlMode).toBe('LOT_EXPIRY');
    expect(product.prescriptionRequired).toBe(false);
  });

  it('rechaza modos desconocidos durante la reconstitución', () => {
    expect(() =>
      Product.reconstitute({
        id: 'p',
        categoryId: 'cat-1',
        code: 'MED-1',
        barcode: null,
        name: 'Producto',
        genericName: null,
        concentration: null,
        sanitaryRegistry: null,
        manufacturer: null,
        description: null,
        inventoryControlMode: 'UNKNOWN' as never,
        prescriptionRequired: false,
        baseUnit: 'UNIDAD',
        basePrice: '1.00',
        baseCost: '0.00',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).toThrow(ProductInventoryControlModeException);
  });
});
