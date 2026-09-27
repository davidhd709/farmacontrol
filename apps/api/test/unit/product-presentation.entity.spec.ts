import { describe, it, expect } from 'vitest';
import { ProductPresentation } from '../../src/modules/catalog/domain/entities/product-presentation.entity';

describe('ProductPresentation Entity (Domain Unit)', () => {
  it('debe instanciar una presentación válida y retornar sus propiedades canónicas', () => {
    const presentation = ProductPresentation.create({
      productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Caja x 30 Tabletas',
      barcode: '7701234567890',
      conversionFactor: 30,
      price: 45000,
      cost: 30000,
      isDefault: true,
    });

    expect(presentation.id).toBeDefined();
    expect(presentation.productId).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(presentation.name).toBe('Caja x 30 Tabletas');
    expect(presentation.barcode).toBe('7701234567890');
    expect(presentation.conversionFactor).toBe(30);
    expect(presentation.price).toBe('45000.00');
    expect(presentation.cost).toBe('30000.00');
    expect(presentation.isDefault).toBe(true);
    expect(presentation.isActive).toBe(true);
  });

  it('debe rechazar la creación cuando el factor de conversión es cero o negativo (RN-004)', () => {
    expect(() =>
      ProductPresentation.create({
        productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'Invalido Cero',
        conversionFactor: 0,
        price: 1000,
      }),
    ).toThrow('El factor de conversión debe ser estrictamente mayor a cero (RN-004).');

    expect(() =>
      ProductPresentation.create({
        productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'Invalido Negativo',
        conversionFactor: -10,
        price: 1000,
      }),
    ).toThrow('El factor de conversión debe ser estrictamente mayor a cero (RN-004).');
  });

  it('debe rechazar la creación cuando el factor no es un número entero discreto (RN-AG-02)', () => {
    expect(() =>
      ProductPresentation.create({
        productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'Fraccionario',
        conversionFactor: 2.5,
        price: 1000,
      }),
    ).toThrow('El factor de conversión a unidad base debe ser un número entero (RN-AG-02).');
  });

  it('debe rechazar precios y costos negativos', () => {
    expect(() =>
      ProductPresentation.create({
        productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'Precio Negativo',
        conversionFactor: 1,
        price: -500,
      }),
    ).toThrow('El precio no puede ser un valor negativo.');

    expect(() =>
      ProductPresentation.create({
        productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'Costo Negativo',
        conversionFactor: 1,
        price: 500,
        cost: -100,
      }),
    ).toThrow('El costo no puede ser un valor negativo.');
  });

  it('toBaseUnits: debe calcular de forma exacta la cantidad en unidad base (RN-004)', () => {
    const box30 = ProductPresentation.create({
      productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Caja x 30',
      conversionFactor: 30,
      price: 30000,
    });

    expect(box30.toBaseUnits(0)).toBe(0);
    expect(box30.toBaseUnits(1)).toBe(30);
    expect(box30.toBaseUnits(5)).toBe(150);
    expect(box30.toBaseUnits(12)).toBe(360);
  });

  it('toBaseUnits: debe rechazar cantidades no enteras o negativas', () => {
    const box30 = ProductPresentation.create({
      productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Caja x 30',
      conversionFactor: 30,
      price: 30000,
    });

    expect(() => box30.toBaseUnits(-1)).toThrow(
      'La cantidad de presentación no puede ser negativa.',
    );
    expect(() => box30.toBaseUnits(1.5)).toThrow(
      'La cantidad de presentación comercial debe ser un número entero discreto.',
    );
  });

  it('fromBaseUnits: debe descomponer existencias base en presentaciones enteras y remanente (RN-004)', () => {
    const box30 = ProductPresentation.create({
      productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Caja x 30',
      conversionFactor: 30,
      price: 30000,
    });

    // 74 tabletas = 2 cajas de 30 + 14 tabletas sueltas
    const result = box30.fromBaseUnits(74);
    expect(result.wholePresentations).toBe(2);
    expect(result.remainderBaseUnits).toBe(14);

    // Múltiplo exacto: 90 tabletas = 3 cajas, 0 sueltas
    const exact = box30.fromBaseUnits(90);
    expect(exact.wholePresentations).toBe(3);
    expect(exact.remainderBaseUnits).toBe(0);

    // Menos que una caja: 15 tabletas = 0 cajas, 15 sueltas
    const less = box30.fromBaseUnits(15);
    expect(less.wholePresentations).toBe(0);
    expect(less.remainderBaseUnits).toBe(15);
  });

  it('debe permitir actualizar propiedades y alternar estado activo/predeterminado', () => {
    const presentation = ProductPresentation.create({
      productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Blíster x 10',
      conversionFactor: 10,
      price: 12000,
    });

    presentation.update({
      name: 'Blíster x 10 Tabletas',
      price: 13500.5,
      cost: 8000,
    });

    expect(presentation.name).toBe('Blíster x 10 Tabletas');
    expect(presentation.price).toBe('13500.50');
    expect(presentation.cost).toBe('8000.00');

    presentation.markAsDefault();
    expect(presentation.isDefault).toBe(true);

    presentation.unmarkAsDefault();
    expect(presentation.isDefault).toBe(false);

    presentation.deactivate();
    expect(presentation.isActive).toBe(false);

    presentation.activate();
    expect(presentation.isActive).toBe(true);
  });
});
