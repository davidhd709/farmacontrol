import type {
  InventoryMovementDto,
  InventoryMovementQueryFilters,
  PaginatedResponse,
  RecordInventoryMovementPayload,
} from '@farmacia/contracts';

export const INVENTORY_MOVEMENT_REPOSITORY_PORT = Symbol(
  'INVENTORY_MOVEMENT_REPOSITORY_PORT',
);

/**
 * Trabajo que debe confirmarse junto con el movimiento (p. ej. su auditoría). Recibe la
 * transacción abierta del repositorio; si falla, se revierten saldo y kardex.
 */
export type WithinMovementTransaction = (
  tx: unknown,
  movement: InventoryMovementDto,
) => Promise<void>;

export interface IInventoryMovementRepository {
  recordMovement(
    payload: RecordInventoryMovementPayload,
    userId?: string,
    withinTransaction?: WithinMovementTransaction,
  ): Promise<InventoryMovementDto>;

  findMovements(
    filters: InventoryMovementQueryFilters,
  ): Promise<PaginatedResponse<InventoryMovementDto>>;
}
