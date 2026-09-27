import { Injectable, Inject } from '@nestjs/common';
import {
  INVENTORY_MOVEMENT_REPOSITORY_PORT,
  IInventoryMovementRepository,
} from '../ports/inventory-movement.repository.port';
import { AuditService } from '../../../audit/application/services/audit.service';
import type {
  InventoryMovementDto,
  InventoryMovementQueryFilters,
  PaginatedResponse,
  RecordInventoryMovementPayload,
} from '@farmacia/contracts';

@Injectable()
export class InventoryMovementService {
  constructor(
    @Inject(INVENTORY_MOVEMENT_REPOSITORY_PORT)
    private readonly movementRepository: IInventoryMovementRepository,
    private readonly auditService: AuditService,
  ) {}

  public async recordMovement(
    payload: RecordInventoryMovementPayload,
    userId?: string,
    ipAddress?: string,
    correlationId?: string,
  ): Promise<InventoryMovementDto> {
    const movement = await this.movementRepository.recordMovement(
      payload,
      userId,
    );

    await this.auditService.recordEvent({
      userId,
      action: `INVENTORY_MOVEMENT_${payload.movementType}`,
      entity: 'InventoryMovement',
      entityId: movement.id,
      details: {
        movementType: payload.movementType,
        productId: payload.productId,
        lotId: payload.lotId,
        quantityBaseUnits: payload.quantityBaseUnits,
        balanceAfter: movement.balanceAfterBaseUnits,
        referenceDoc: payload.referenceDocumentId,
      },
      ipAddress,
      correlationId,
    });

    return movement;
  }

  public async adjustInventory(
    payload: {
      productId: string;
      lotId: string;
      adjustmentType: 'INCREMENTO' | 'DECREMENTO';
      quantityBaseUnits: number;
      reason: string;
      notes?: string;
    },
    userId?: string,
    ipAddress?: string,
    correlationId?: string,
  ): Promise<InventoryMovementDto> {
    const isIncrement = payload.adjustmentType === 'INCREMENTO';
    const delta = isIncrement
      ? Math.abs(payload.quantityBaseUnits)
      : -Math.abs(payload.quantityBaseUnits);

    const movementType = isIncrement ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO';

    const movement = await this.movementRepository.recordMovement(
      {
        movementType,
        productId: payload.productId,
        lotId: payload.lotId,
        quantityBaseUnits: delta,
        referenceDocumentType: 'AJUSTE_MANUAL',
        referenceDocumentId: `MOTIVO: ${payload.reason}`,
        notes: payload.notes || payload.reason,
      },
      userId,
    );

    await this.auditService.recordEvent({
      userId,
      action: 'INVENTORY_MANUAL_ADJUSTMENT',
      entity: 'InventoryMovement',
      entityId: movement.id,
      details: {
        adjustmentType: payload.adjustmentType,
        productId: payload.productId,
        lotId: payload.lotId,
        quantityBaseUnits: delta,
        reason: payload.reason,
        balanceAfter: movement.balanceAfterBaseUnits,
      },
      ipAddress,
      correlationId,
    });

    return movement;
  }

  public async getMovements(
    filters: InventoryMovementQueryFilters,
  ): Promise<PaginatedResponse<InventoryMovementDto>> {
    return this.movementRepository.findMovements(filters);
  }
}
