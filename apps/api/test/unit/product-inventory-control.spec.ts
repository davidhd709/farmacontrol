import { describe, it, expect } from 'vitest';
import { Product } from '../../src/modules/catalog/domain/entities/product.entity';
import { ProductLotControlRequiredException } from '../../src/modules/catalog/domain/exceptions/product.exceptions';

/** FARM-AUD-002: el catálogo no admite productos sin control de inventario por lote. */
describe('Product: control de lote obligatorio (FARM-AUD-002)', () => {
  const base = {
    categoryId: 'cat-1',
    code: 'MED-001',
    name: 'Acetaminofén 500 mg',
    basePrice: 200,
  };

  it('crea el producto con control de lote por defecto', () => {
    expect(Product.create(base).requiresLotControl).toBe(true);
  });

  it('rechaza crear un producto con requiresLotControl=false', () => {
    expect(() => Product.create({ ...base, requiresLotControl: false })).toThrow(
      ProductLotControlRequiredException,
    );
  });

  it('rechaza desactivar el control de lote y no aplica ningún otro cambio de la misma edición', () => {
    const product = Product.create(base);

    expect(() => product.update({ name: 'Otro nombre', requiresLotControl: false })).toThrow(
      ProductLotControlRequiredException,
    );
    expect(product.name).toBe('Acetaminofén 500 mg');
    expect(product.requiresLotControl).toBe(true);
  });

  it('un producto antiguo sin control puede editarse y regularizarse explícitamente', () => {
    const legacy = Product.reconstitute({
      id: 'p-legacy',
      categoryId: 'cat-1',
      code: 'LEG-001',
      barcode: null,
      name: 'Caldero 20 cm',
      genericName: null,
      concentration: null,
      sanitaryRegistry: null,
      manufacturer: null,
      description: null,
      requiresLotControl: false,
      prescriptionRequired: false,
      baseUnit: 'UNIDAD',
      basePrice: '45000.00',
      baseCost: '0.00',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    legacy.update({ name: 'Caldero 20 cm acero' });
    expect(legacy.requiresLotControl).toBe(false);

    legacy.update({ requiresLotControl: true });
    expect(legacy.requiresLotControl).toBe(true);
  });
});
