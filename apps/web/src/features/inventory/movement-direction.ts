export type MovementDirection = 'in' | 'out' | 'neutral';

const INBOUND_TYPES = new Set(['AJUSTE_POSITIVO', 'DEVOLUCION_CLIENTE', 'TRASLADO_ENTRADA']);
const OUTBOUND_TYPES = new Set(['AJUSTE_NEGATIVO', 'DEVOLUCION_PROVEEDOR', 'TRASLADO_SALIDA']);

/**
 * El sentido de un movimiento lo da su tipo: el kardex guarda las salidas por venta o
 * devolución con cantidad positiva y los ajustes negativos con cantidad negativa.
 */
export function movementDirection(movementType: string): MovementDirection {
  if (movementType.startsWith('ENTRADA') || INBOUND_TYPES.has(movementType)) return 'in';
  if (movementType.startsWith('SALIDA') || OUTBOUND_TYPES.has(movementType)) return 'out';
  return 'neutral';
}

export function formatSignedQuantity(movementType: string, quantityBaseUnits: number): string {
  const magnitude = Math.abs(quantityBaseUnits);
  const direction = movementDirection(movementType);
  if (direction === 'in') return `+${magnitude}`;
  if (direction === 'out') return `−${magnitude}`;
  return String(quantityBaseUnits);
}
