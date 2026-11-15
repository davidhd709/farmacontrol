import { describe, expect, it } from 'vitest';
import { signedMovementQuantity } from '@farmacia/contracts';
import {
  formatSignedQuantity,
  movementDirection,
} from '../src/features/inventory/movement-direction';

describe('Sentido de los movimientos de kardex', () => {
  it('clasifica entradas y salidas por tipo, no por el signo guardado', () => {
    for (const type of [
      'ENTRADA_COMPRA',
      'ENTRADA_DEVOLUCION_VENTA',
      'AJUSTE_POSITIVO',
      'DEVOLUCION_CLIENTE',
      'TRASLADO_ENTRADA',
    ]) {
      expect(movementDirection(type), type).toBe('in');
    }
    for (const type of [
      'SALIDA_VENTA',
      'SALIDA_DEVOLUCION_COMPRA',
      'AJUSTE_NEGATIVO',
      'DEVOLUCION_PROVEEDOR',
      'TRASLADO_SALIDA',
    ]) {
      expect(movementDirection(type), type).toBe('out');
    }
    expect(movementDirection('OTRO')).toBe('neutral');
  });

  it('muestra las salidas con signo negativo aunque la cantidad se haya guardado positiva', () => {
    expect(formatSignedQuantity('SALIDA_VENTA', 5)).toBe('−5');
    expect(formatSignedQuantity('AJUSTE_NEGATIVO', -5)).toBe('−5');
    expect(formatSignedQuantity('ENTRADA_COMPRA', 12)).toBe('+12');
    expect(formatSignedQuantity('DEVOLUCION_CLIENTE', 2)).toBe('+2');
  });

  it('la regla compartida con el servidor da el efecto en la existencia con su signo', () => {
    expect(signedMovementQuantity('SALIDA_VENTA', 5)).toBe(-5);
    expect(signedMovementQuantity('AJUSTE_NEGATIVO', -4)).toBe(-4);
    expect(signedMovementQuantity('ENTRADA_DEVOLUCION_VENTA', 3)).toBe(3);
    expect(signedMovementQuantity('AJUSTE_POSITIVO', 10)).toBe(10);
  });
});
