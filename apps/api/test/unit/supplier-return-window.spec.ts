import { describe, expect, it } from 'vitest';
import { supplierReturnStatus } from '../../src/modules/reports/domain/supplier-return-window';

describe('Ventana de aviso al proveedor (acuerdo del 4 de octubre)', () => {
  it('avisa entre 120 y 110 días, marca atraso hasta 91 y fuera de plazo desde 90', () => {
    expect(supplierReturnStatus(121)).toBeNull();
    expect(supplierReturnStatus(120)).toBe('AVISAR_AHORA');
    expect(supplierReturnStatus(110)).toBe('AVISAR_AHORA');
    expect(supplierReturnStatus(109)).toBe('AVISO_ATRASADO');
    expect(supplierReturnStatus(91)).toBe('AVISO_ATRASADO');
    expect(supplierReturnStatus(90)).toBe('FUERA_DE_PLAZO');
    expect(supplierReturnStatus(1)).toBe('FUERA_DE_PLAZO');
    expect(supplierReturnStatus(0)).toBeNull();
  });
});
