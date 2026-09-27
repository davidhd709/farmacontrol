import { Injectable, BadRequestException } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import { IInventoryMovementRepository } from '../../application/ports/inventory-movement.repository.port';
import type {
  InventoryMovementDto,
  InventoryMovementQueryFilters,
  PaginatedResponse,
  RecordInventoryMovementPayload,
} from '@farmacia/contracts';

@Injectable()
export class PrismaInventoryMovementRepository
  implements IInventoryMovementRepository
{
  public async recordMovement(
    payload: RecordInventoryMovementPayload,
    userId?: string,
  ): Promise<InventoryMovementDto> {
    return prisma.$transaction(async (tx) => {
      // 1. Bloqueo pesimista del lote para concurrencia segura
      const lot = await tx.inventoryLot.findUnique({
        where: { id: payload.lotId },
      });

      if (!lot) {
        throw new BadRequestException('El lote especificado no existe.');
      }

      const newBalance = lot.currentQuantity + payload.quantityBaseUnits;
      if (newBalance < 0) {
        throw new BadRequestException(
          `Inventario insuficiente. Existencia actual: ${lot.currentQuantity}, intentó descontar: ${Math.abs(payload.quantityBaseUnits)}`,
        );
      }

      // 2. Actualizar saldo del lote
      await tx.inventoryLot.update({
        where: { id: lot.id },
        data: {
          currentQuantity: newBalance,
          updatedAt: new Date(),
        },
      });

      // 3. Registrar movimiento inmutable en el Kardex
      const commercialQty =
        payload.quantityCommercial !== undefined && payload.quantityCommercial !== null
          ? new Prisma.Decimal(String(payload.quantityCommercial))
          : null;

      const movement = await tx.inventoryMovement.create({
        data: {
          movementType: payload.movementType,
          productId: payload.productId,
          lotId: payload.lotId,
          presentationId: payload.presentationId || null,
          quantityBaseUnits: payload.quantityBaseUnits,
          presentationFactorHistorical: payload.presentationFactorHistorical ?? 1,
          quantityCommercial: commercialQty,
          balanceAfterBaseUnits: newBalance,
          referenceDocumentType: payload.referenceDocumentType || null,
          referenceDocumentId: payload.referenceDocumentId || null,
          notes: payload.notes || null,
          createdByUserId: userId || null,
        },
        include: {
          product: {
            select: { id: true, code: true, name: true, baseUnit: true },
          },
          lot: {
            select: { id: true, lotNumber: true, expirationDate: true },
          },
          presentation: {
            select: { id: true, name: true, conversionFactor: true },
          },
        },
      });

      return {
        id: movement.id,
        movementType: movement.movementType as any,
        productId: movement.productId,
        lotId: movement.lotId,
        presentationId: movement.presentationId,
        quantityBaseUnits: movement.quantityBaseUnits,
        presentationFactorHistorical: movement.presentationFactorHistorical,
        quantityCommercial: movement.quantityCommercial?.toString() || null,
        balanceAfterBaseUnits: movement.balanceAfterBaseUnits,
        referenceDocumentType: movement.referenceDocumentType,
        referenceDocumentId: movement.referenceDocumentId,
        notes: movement.notes,
        createdByUserId: movement.createdByUserId,
        createdAt: movement.createdAt.toISOString(),
        product: movement.product,
        lot: movement.lot
          ? {
              id: movement.lot.id,
              lotNumber: movement.lot.lotNumber,
              expirationDate: movement.lot.expirationDate
                .toISOString()
                .split('T')[0],
            }
          : undefined,
        presentation: movement.presentation,
      };
    });
  }

  public async findMovements(
    filters: InventoryMovementQueryFilters,
  ): Promise<PaginatedResponse<InventoryMovementDto>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.InventoryMovementWhereInput = {};

    if (filters.productId) where.productId = filters.productId;
    if (filters.lotId) where.lotId = filters.lotId;
    if (filters.movementType) where.movementType = filters.movementType;
    if (filters.referenceDocumentId)
      where.referenceDocumentId = filters.referenceDocumentId;

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
    }

    const [total, items] = await Promise.all([
      prisma.inventoryMovement.count({ where }),
      prisma.inventoryMovement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: { id: true, code: true, name: true, baseUnit: true },
          },
          lot: {
            select: { id: true, lotNumber: true, expirationDate: true },
          },
          presentation: {
            select: { id: true, name: true, conversionFactor: true },
          },
        },
      }),
    ]);

    return {
      items: items.map((m) => ({
        id: m.id,
        movementType: m.movementType as any,
        productId: m.productId,
        lotId: m.lotId,
        presentationId: m.presentationId,
        quantityBaseUnits: m.quantityBaseUnits,
        presentationFactorHistorical: m.presentationFactorHistorical,
        quantityCommercial: m.quantityCommercial?.toString() || null,
        balanceAfterBaseUnits: m.balanceAfterBaseUnits,
        referenceDocumentType: m.referenceDocumentType,
        referenceDocumentId: m.referenceDocumentId,
        notes: m.notes,
        createdByUserId: m.createdByUserId,
        createdAt: m.createdAt.toISOString(),
        product: m.product,
        lot: m.lot
          ? {
              id: m.lot.id,
              lotNumber: m.lot.lotNumber,
              expirationDate: m.lot.expirationDate
                .toISOString()
                .split('T')[0],
            }
          : undefined,
        presentation: m.presentation,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
