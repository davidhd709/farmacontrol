import { describe, it, expect } from 'vitest';
import { InventoryLot } from '../../src/modules/inventory/domain/entities/inventory-lot.entity';
import { Location } from '../../src/modules/inventory/domain/entities/location.entity';

describe('InventoryLot & Location Domain Entities (Unit)', () => {
  it('debe instanciar un lote válido con cantidades en unidades base enteras', () => {
    const lot = InventoryLot.create({
      productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      locationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      lotNumber: 'lt-12345',
      expirationDate: '2028-12-31',
      currentQuantity: 100,
    });

    expect(lot.id).toBeDefined();
    expect(lot.productId).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(lot.locationId).toBe('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22');
    expect(lot.lotNumber).toBe('LT-12345');
    expect(lot.currentQuantity).toBe(100);
    expect(lot.isActive).toBe(true);
    expect(lot.isExpired()).toBe(false);
  });

  it('debe rechazar cantidades negativas en la creación de lote (RN-AG-02 / CHECK)', () => {
    expect(() =>
      InventoryLot.create({
        productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        locationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        lotNumber: 'LT-ERR',
        expirationDate: '2028-12-31',
        currentQuantity: -5,
      }),
    ).toThrow('La cantidad del lote debe ser un entero positivo o cero en unidades base.');
  });

  it('debe rechazar fechas inválidas o números de lote vacíos', () => {
    expect(() =>
      InventoryLot.create({
        productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        locationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        lotNumber: ' ',
        expirationDate: '2028-12-31',
      }),
    ).toThrow('El código de lote debe tener al menos 2 caracteres.');

    expect(() =>
      InventoryLot.create({
        productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        locationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        lotNumber: 'LT-VAL',
        expirationDate: 'fecha-invalida',
      }),
    ).toThrow('La fecha de vencimiento es inválida.');
  });

  it('debe evaluar correctamente si un lote está vencido y días restantes de vida útil', () => {
    const today = new Date('2026-10-01');

    const expiredLot = InventoryLot.create({
      productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      locationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      lotNumber: 'LT-VENCIDO',
      expirationDate: '2026-09-15',
    });

    const activeLot = InventoryLot.create({
      productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      locationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      lotNumber: 'LT-FUTURO',
      expirationDate: '2026-10-11',
    });

    expect(expiredLot.isExpired(today)).toBe(true);
    expect(activeLot.isExpired(today)).toBe(false);
    expect(activeLot.daysUntilExpiration(today)).toBe(10);
  });

  it('debe instanciar una ubicación correctamente con código en mayúsculas', () => {
    const loc = new Location({
      code: 'bod-est-01',
      name: 'Estantería 1 Bodega',
      description: 'Lado norte',
      isDefault: true,
    });

    expect(loc.id).toBeDefined();
    expect(loc.code).toBe('BOD-EST-01');
    expect(loc.name).toBe('Estantería 1 Bodega');
    expect(loc.isDefault).toBe(true);
    expect(loc.isActive).toBe(true);
  });
});
