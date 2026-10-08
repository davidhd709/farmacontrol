import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import { IInventoryLotRepository } from '../../application/ports/inventory-lot.repository.port';
import { InventoryLot } from '../../domain/entities/inventory-lot.entity';
import { Location } from '../../domain/entities/location.entity';
import type {
  InventoryLotQueryFilters,
  PaginatedResponse,
  InventoryLotDto,
} from '@farmacia/contracts';

@Injectable()
export class PrismaInventoryLotRepository implements IInventoryLotRepository {
  public async findById(id: string): Promise<InventoryLot | null> {
    const raw = await prisma.inventoryLot.findUnique({
      where: { id },
      include: {
        product: {
          select: { id: true, code: true, name: true, baseUnit: true },
        },
        location: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    if (!raw) return null;

    return InventoryLot.reconstitute({
      id: raw.id,
      productId: raw.productId,
      locationId: raw.locationId,
      lotNumber: raw.lotNumber,
      expirationDate: raw.expirationDate,
      currentQuantity: raw.currentQuantity,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      product: raw.product,
      location: raw.location,
    });
  }

  public async findByProductLocationAndLotNumber(
    productId: string,
    locationId: string,
    lotNumber: string,
  ): Promise<InventoryLot | null> {
    const raw = await prisma.inventoryLot.findUnique({
      where: {
        productId_locationId_lotNumber: {
          productId,
          locationId,
          lotNumber: lotNumber.trim().toUpperCase(),
        },
      },
      include: {
        product: {
          select: { id: true, code: true, name: true, baseUnit: true },
        },
        location: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    if (!raw) return null;

    return InventoryLot.reconstitute({
      id: raw.id,
      productId: raw.productId,
      locationId: raw.locationId,
      lotNumber: raw.lotNumber,
      expirationDate: raw.expirationDate,
      currentQuantity: raw.currentQuantity,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      product: raw.product,
      location: raw.location,
    });
  }

  public async findAvailableLotsByProductFefo(
    productId: string,
    locationId?: string,
  ): Promise<InventoryLot[]> {
    const where: Prisma.InventoryLotWhereInput = {
      productId,
      currentQuantity: { gt: 0 },
      isActive: true,
      ...(locationId ? { locationId } : {}),
    };

    const rawLots = await prisma.inventoryLot.findMany({
      where,
      orderBy: [{ expirationDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        product: {
          select: { id: true, code: true, name: true, baseUnit: true },
        },
        location: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    return rawLots.map((raw) =>
      InventoryLot.reconstitute({
        id: raw.id,
        productId: raw.productId,
        locationId: raw.locationId,
        lotNumber: raw.lotNumber,
        expirationDate: raw.expirationDate,
        currentQuantity: raw.currentQuantity,
        isActive: raw.isActive,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        product: raw.product,
        location: raw.location,
      }),
    );
  }

  public async findAll(
    filters: InventoryLotQueryFilters,
  ): Promise<PaginatedResponse<InventoryLotDto>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.InventoryLotWhereInput = {};

    if (filters.productId) {
      where.productId = filters.productId;
    }
    if (filters.locationId) {
      where.locationId = filters.locationId;
    }
    if (filters.lotNumber) {
      where.lotNumber = {
        contains: filters.lotNumber.trim().toUpperCase(),
        mode: 'insensitive',
      };
    }
    if (filters.hasStockOnly) {
      where.currentQuantity = { gt: 0 };
    }
    if (filters.expiringBefore) {
      where.expirationDate = { lte: new Date(filters.expiringBefore) };
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const [total, items] = await Promise.all([
      prisma.inventoryLot.count({ where }),
      prisma.inventoryLot.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ expirationDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          product: {
            select: { id: true, code: true, name: true, baseUnit: true },
          },
          location: {
            select: { id: true, code: true, name: true },
          },
        },
      }),
    ]);

    return {
      items: items.map((raw) => ({
        id: raw.id,
        productId: raw.productId,
        locationId: raw.locationId,
        lotNumber: raw.lotNumber,
        expirationDate: raw.expirationDate.toISOString().split('T')[0],
        currentQuantity: raw.currentQuantity,
        isActive: raw.isActive,
        createdAt: raw.createdAt.toISOString(),
        updatedAt: raw.updatedAt.toISOString(),
        product: raw.product,
        location: raw.location,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  public async createWithOpeningBalance(
    lot: InventoryLot,
    userId?: string,
  ): Promise<InventoryLot> {
    const raw = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryLot.create({
        data: {
          id: lot.id,
          productId: lot.productId,
          locationId: lot.locationId,
          lotNumber: lot.lotNumber,
          expirationDate: lot.expirationDate,
          currentQuantity: lot.currentQuantity,
          isActive: lot.isActive,
          createdAt: lot.createdAt,
          updatedAt: lot.updatedAt,
        },
        include: {
          product: {
            select: { id: true, code: true, name: true, baseUnit: true },
          },
          location: {
            select: { id: true, code: true, name: true },
          },
        },
      });

      if (lot.currentQuantity > 0) {
        await tx.inventoryMovement.create({
          data: {
            movementType: 'AJUSTE_POSITIVO',
            productId: created.productId,
            lotId: created.id,
            quantityBaseUnits: lot.currentQuantity,
            presentationFactorHistorical: 1,
            balanceAfterBaseUnits: lot.currentQuantity,
            referenceDocumentType: 'SALDO_INICIAL',
            referenceDocumentId: created.id,
            notes: 'Existencia inicial registrada al crear el lote',
            createdByUserId: userId || null,
          },
        });
      }

      return created;
    });

    return InventoryLot.reconstitute({
      id: raw.id,
      productId: raw.productId,
      locationId: raw.locationId,
      lotNumber: raw.lotNumber,
      expirationDate: raw.expirationDate,
      currentQuantity: raw.currentQuantity,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      product: raw.product,
      location: raw.location,
    });
  }

  public async findLocationById(id: string): Promise<Location | null> {
    const raw = await prisma.location.findUnique({ where: { id } });
    if (!raw) return null;
    return new Location({
      id: raw.id,
      code: raw.code,
      name: raw.name,
      description: raw.description,
      isDefault: raw.isDefault,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public async findDefaultLocation(): Promise<Location | null> {
    const raw = await prisma.location.findFirst({
      where: { isDefault: true, isActive: true },
    });
    if (!raw) {
      // Tomamos la primera activa si no hay default marcada
      const fallback = await prisma.location.findFirst({
        where: { isActive: true },
      });
      if (!fallback) return null;
      return new Location({
        id: fallback.id,
        code: fallback.code,
        name: fallback.name,
        description: fallback.description,
        isDefault: fallback.isDefault,
        isActive: fallback.isActive,
        createdAt: fallback.createdAt,
        updatedAt: fallback.updatedAt,
      });
    }
    return new Location({
      id: raw.id,
      code: raw.code,
      name: raw.name,
      description: raw.description,
      isDefault: raw.isDefault,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public async findAllLocations(): Promise<Location[]> {
    const rows = await prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(
      (raw) =>
        new Location({
          id: raw.id,
          code: raw.code,
          name: raw.name,
          description: raw.description,
          isDefault: raw.isDefault,
          isActive: raw.isActive,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        }),
    );
  }

  public async saveLocation(location: Location): Promise<Location> {
    const raw = await prisma.location.upsert({
      where: { id: location.id },
      create: {
        id: location.id,
        code: location.code,
        name: location.name,
        description: location.description,
        isDefault: location.isDefault,
        isActive: location.isActive,
        createdAt: location.createdAt,
        updatedAt: location.updatedAt,
      },
      update: {
        code: location.code,
        name: location.name,
        description: location.description,
        isDefault: location.isDefault,
        isActive: location.isActive,
        updatedAt: new Date(),
      },
    });

    return new Location({
      id: raw.id,
      code: raw.code,
      name: raw.name,
      description: raw.description,
      isDefault: raw.isDefault,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
