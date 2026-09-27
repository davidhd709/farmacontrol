import { describe, it, expect } from 'vitest';
import { FefoAllocationEngine } from '../../src/modules/inventory/domain/services/fefo-allocation.engine';

describe('FefoAllocationEngine (Domain Unit)', () => {
  const refDate = new Date('2026-10-01');

  it('debe asignar la cantidad completa de un único lote cuando cubre la demanda', () => {
    const candidates = [
      {
        id: 'lot-1',
        lotNumber: 'LT-OCT-26',
        expirationDate: new Date('2026-10-20'),
        availableQuantity: 50,
      },
      {
        id: 'lot-2',
        lotNumber: 'LT-NOV-26',
        expirationDate: new Date('2026-11-15'),
        availableQuantity: 100,
      },
    ];

    const result = FefoAllocationEngine.allocate(
      'prod-1',
      30,
      candidates,
      refDate,
    );

    expect(result.totalAllocated).toBe(30);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].lotId).toBe('lot-1');
    expect(result.allocations[0].quantityBaseUnits).toBe(30);
  });

  it('debe fraccionar la asignación (split allocation) cuando el lote más próximo no cubre el total requerido', () => {
    const candidates = [
      {
        id: 'lot-1',
        lotNumber: 'LT-01',
        expirationDate: new Date('2026-10-15'),
        availableQuantity: 20,
      },
      {
        id: 'lot-2',
        lotNumber: 'LT-02',
        expirationDate: new Date('2026-11-01'),
        availableQuantity: 40,
      },
      {
        id: 'lot-3',
        lotNumber: 'LT-03',
        expirationDate: new Date('2027-01-01'),
        availableQuantity: 100,
      },
    ];

    const result = FefoAllocationEngine.allocate(
      'prod-1',
      50,
      candidates,
      refDate,
    );

    expect(result.totalAllocated).toBe(50);
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0].lotId).toBe('lot-1');
    expect(result.allocations[0].quantityBaseUnits).toBe(20);
    expect(result.allocations[1].lotId).toBe('lot-2');
    expect(result.allocations[1].quantityBaseUnits).toBe(30);
  });

  it('debe omitir lotes vencidos al calcular la asignación FEFO', () => {
    const candidates = [
      {
        id: 'lot-vencido',
        lotNumber: 'LT-VENC',
        expirationDate: new Date('2026-09-10'), // Ya vencido a fecha ref 2026-10-01
        availableQuantity: 100,
      },
      {
        id: 'lot-vigente',
        lotNumber: 'LT-VIG',
        expirationDate: new Date('2026-10-15'),
        availableQuantity: 25,
      },
    ];

    const result = FefoAllocationEngine.allocate(
      'prod-1',
      20,
      candidates,
      refDate,
    );

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].lotId).toBe('lot-vigente');
    expect(result.allocations[0].quantityBaseUnits).toBe(20);
  });

  it('debe lanzar InsufficientInventoryException si el total vigente es inferior a lo solicitado', () => {
    const candidates = [
      {
        id: 'lot-1',
        lotNumber: 'LT-01',
        expirationDate: new Date('2026-10-15'),
        availableQuantity: 15,
      },
    ];

    expect(() =>
      FefoAllocationEngine.allocate('prod-1', 20, candidates, refDate),
    ).toThrow('Inventario no vencido insuficiente. Requerido: 20, Disponible: 15');
  });
});
