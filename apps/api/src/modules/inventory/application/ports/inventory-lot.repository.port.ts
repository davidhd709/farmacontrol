import { InventoryLot } from '../../domain/entities/inventory-lot.entity';
import { Location } from '../../domain/entities/location.entity';
import type { InventoryLotQueryFilters, PaginatedResponse, InventoryLotDto } from '@farmacia/contracts';

export const INVENTORY_LOT_REPOSITORY_PORT = Symbol('INVENTORY_LOT_REPOSITORY_PORT');

export interface IInventoryLotRepository {
  findById(id: string): Promise<InventoryLot | null>;
  findByProductLocationAndLotNumber(productId: string, locationId: string, lotNumber: string): Promise<InventoryLot | null>;
  findAvailableLotsByProductFefo(productId: string, locationId?: string): Promise<InventoryLot[]>;
  findAll(filters: InventoryLotQueryFilters): Promise<PaginatedResponse<InventoryLotDto>>;
  /**
   * Crea un lote nuevo. Si trae existencia inicial, registra en la misma transacción
   * el movimiento de kardex que la respalda (AUD-004): el stock nunca aparece sin documento.
   */
  createWithOpeningBalance(lot: InventoryLot, userId?: string): Promise<InventoryLot>;
  
  // Ubicaciones
  findLocationById(id: string): Promise<Location | null>;
  findDefaultLocation(): Promise<Location | null>;
  findAllLocations(): Promise<Location[]>;
  saveLocation(location: Location): Promise<Location>;
}
