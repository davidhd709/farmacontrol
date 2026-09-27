import { describe, expect, it } from 'vitest';
import { Product } from '../../src/modules/catalog/domain/entities/product.entity';

describe('Product Entity (Domain Unit)', () => {
  const validProps = {
    categoryId: 'c0000000-0000-0000-0000-000000000001',
    categoryName: 'Analgésicos',
    code: 'ACE-500',
    barcode: '7701234567890',
    name: 'Acetaminofén 500mg',
    genericName: 'Paracetamol',
    concentration: '500 mg',
    sanitaryRegistry: 'INVIMA 2020M-001234',
    manufacturer: 'Laboratorios Genéricos',
    description: 'Analgésico y antipirético',
    requiresLotControl: true,
    prescriptionRequired: false,
    baseUnit: 'unidad',
    basePrice: 1500.5,
    baseCost: 800.25,
  };

  it('debe instanciar un producto válido con valores formateados e invariantes cumplidas', () => {
    const product = Product.create(validProps);

    expect(product.id).toBeDefined();
    expect(product.categoryId).toBe(validProps.categoryId);
    expect(product.categoryName).toBe('Analgésicos');
    expect(product.code).toBe('ACE-500');
    expect(product.barcode).toBe('7701234567890');
    expect(product.name).toBe('Acetaminofén 500mg');
    expect(product.genericName).toBe('Paracetamol');
    expect(product.concentration).toBe('500 mg');
    expect(product.sanitaryRegistry).toBe('INVIMA 2020M-001234');
    expect(product.manufacturer).toBe('Laboratorios Genéricos');
    expect(product.requiresLotControl).toBe(true);
    expect(product.prescriptionRequired).toBe(false);
    expect(product.baseUnit).toBe('UNIDAD'); // Normalizado a mayúsculas
    expect(product.basePrice).toBe('1500.50');
    expect(product.baseCost).toBe('800.25');
    expect(product.isActive).toBe(true);
    expect(product.createdAt).toBeInstanceOf(Date);
    expect(product.updatedAt).toBeInstanceOf(Date);
  });

  it('debe rechazar código interno vacío o menor a 2 caracteres', () => {
    expect(() =>
      Product.create({ ...validProps, code: ' ' }),
    ).toThrow('El código interno (SKU) del producto es requerido.');

    expect(() =>
      Product.create({ ...validProps, code: 'A' }),
    ).toThrow('El código interno (SKU) debe tener entre 2 y 50 caracteres.');
  });

  it('debe rechazar nombre comercial vacío o menor a 2 caracteres', () => {
    expect(() =>
      Product.create({ ...validProps, name: ' ' }),
    ).toThrow('El nombre comercial del producto es requerido.');

    expect(() =>
      Product.create({ ...validProps, name: 'X' }),
    ).toThrow('El nombre comercial debe tener entre 2 y 150 caracteres.');
  });

  it('debe rechazar código de barras inválido si se proporciona', () => {
    expect(() =>
      Product.create({ ...validProps, barcode: '12' }),
    ).toThrow('El código de barras debe tener entre 3 y 50 caracteres si se proporciona.');
  });

  it('debe rechazar precios negativos o no numéricos', () => {
    expect(() =>
      Product.create({ ...validProps, basePrice: -10 }),
    ).toThrow('El precio base no puede ser un valor negativo.');

    expect(() =>
      Product.create({ ...validProps, basePrice: 'abc' }),
    ).toThrow('El valor para precio base no es un número válido.');

    expect(() =>
      Product.create({ ...validProps, baseCost: -5 }),
    ).toThrow('El costo base no puede ser un valor negativo.');
  });

  it('debe actualizar atributos del producto respetando invariantes', () => {
    const product = Product.create(validProps);
    const initialUpdatedAt = product.updatedAt;

    product.update({
      name: 'Acetaminofén Forte 650mg',
      basePrice: 2200,
      requiresLotControl: true,
      prescriptionRequired: true,
    });

    expect(product.name).toBe('Acetaminofén Forte 650mg');
    expect(product.basePrice).toBe('2200.00');
    expect(product.prescriptionRequired).toBe(true);
    expect(product.updatedAt.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());
  });

  it('debe activar y desactivar lógicamente el producto', () => {
    const product = Product.create(validProps);

    product.deactivate();
    expect(product.isActive).toBe(false);

    product.activate();
    expect(product.isActive).toBe(true);
  });

  it('debe serializar a DTO compatible con los contratos del monorepo', () => {
    const product = Product.create(validProps);
    const dto = product.toDto();

    expect(dto.id).toBe(product.id);
    expect(dto.code).toBe(product.code);
    expect(dto.name).toBe(product.name);
    expect(dto.basePrice).toBe('1500.50');
    expect(dto.baseCost).toBe('800.25');
    expect(dto.isActive).toBe(true);
  });
});
