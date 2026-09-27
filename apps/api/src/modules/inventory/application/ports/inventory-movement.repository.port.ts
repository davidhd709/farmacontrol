import type {
  InventoryMovementDto,
  InventoryMovementQueryFilters,
  PaginatedResponse,
  RecordInventoryMovementPayload,
} from '@farmacia/contracts';

export const INVENTORY_MOVEMENT_REPOSITORY_PORT = Symbol(
  'INVENTORY_MOVEMENT_REPOSITORY_PORT',
);

export interface IInventoryMovementRepository {
  recordMovement(
    payload: RecordInventoryMovementPayload,
    userId?: string,
  ): Promise<InventoryMovementDto>;

  findMovements(
    filters: InventoryMovementQueryFilters,
  ): Promise<PaginatedResponse<InventoryMovementDto>>;
}
