import type {
  InventoryMovementDto,
  InventoryMovementQueryFilters,
  PaginatedResponse,
  RecordInventoryMovementPayload,
} from '@farmacia/contracts';

export const INVENTORY_MOVEMENT_REPOSITORY_PORT = Symbol('INVENTORY_MOVEMENT_REPOSITORY_PORT');

/**
 * Trabajo que debe confirmarse junto con el movimiento (p. ej. su auditoría). Recibe la
 * transacción abierta del repositorio; si falla, se revierten saldo y kardex.
 */
export type WithinMovementTransaction = (
  tx: unknown,
  movement: InventoryMovementDto,
) => Promise<void>;

/**
 * Se ejecuta al abrir la transacción, antes de bloquear el lote o escribir. Si devuelve un
 * movimiento (respuesta guardada de una solicitud idempotente repetida), el repositorio lo
 * devuelve sin escribir nada.
 */
export type ReplayMovement = (tx: unknown) => Promise<InventoryMovementDto | null>;

export interface IInventoryMovementRepository {
  recordMovement(
    payload: RecordInventoryMovementPayload,
    userId?: string,
    withinTransaction?: WithinMovementTransaction,
    replay?: ReplayMovement,
  ): Promise<InventoryMovementDto>;

  findMovements(
    filters: InventoryMovementQueryFilters,
  ): Promise<PaginatedResponse<InventoryMovementDto>>;
}
