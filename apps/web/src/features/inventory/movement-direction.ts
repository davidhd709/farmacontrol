import { inventoryMovementDirection, signedMovementQuantity } from '@farmacia/contracts';

export type { InventoryMovementDirection as MovementDirection } from '@farmacia/contracts';

/** La regla vive en los contratos compartidos: el servidor calcula la misma cantidad con signo. */
export const movementDirection = inventoryMovementDirection;

export function formatSignedQuantity(movementType: string, quantityBaseUnits: number): string {
  const signed = signedMovementQuantity(movementType, quantityBaseUnits);
  const direction = inventoryMovementDirection(movementType);
  if (direction === 'in') return `+${signed}`;
  if (direction === 'out') return `−${Math.abs(signed)}`;
  return String(signed);
}
