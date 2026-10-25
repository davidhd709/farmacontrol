import { prisma, Prisma } from '@farmacia/database';
import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  INVENTORY_LOT_REPOSITORY_PORT,
  IInventoryLotRepository,
} from '../ports/inventory-lot.repository.port';
import {
  PRODUCT_REPOSITORY_PORT,
  ProductRepositoryPort,
} from '../../../catalog/application/ports/product.repository.port';
import { InventoryLot } from '../../domain/entities/inventory-lot.entity';
import { InventoryDomainException } from '../../domain/exceptions/inventory.exceptions';
import { Location } from '../../domain/entities/location.entity';
import { AuditService } from '../../../audit/application/services/audit.service';
import type {
  CreateInventoryLotPayload,
  InventoryLotDto,
  InventoryLotQueryFilters,
  PaginatedResponse,
  LocationDto,
  CreateLocationPayload,
} from '@farmacia/contracts';

@Injectable()
export class InventoryLotService {
  constructor(
    @Inject(INVENTORY_LOT_REPOSITORY_PORT)
    private readonly lotRepository: IInventoryLotRepository,
    @Inject(PRODUCT_REPOSITORY_PORT)
    private readonly productRepository: ProductRepositoryPort,
    private readonly auditService: AuditService,
  ) {}

  public async getLots(
    filters: InventoryLotQueryFilters,
  ): Promise<PaginatedResponse<InventoryLotDto>> {
    return this.lotRepository.findAll(filters);
  }

  public async getLotById(id: string): Promise<InventoryLotDto> {
    const lot = await this.lotRepository.findById(id);
    if (!lot) {
      throw new NotFoundException(`Lote con ID "${id}" no encontrado.`);
    }
    return lot.toDto();
  }

  public async getAvailableLotsFefo(
    productId: string,
    locationId?: string,
  ): Promise<InventoryLotDto[]> {
    const lots = await this.lotRepository.findAvailableLotsByProductFefo(productId, locationId);
    return lots.map((lot) => lot.toDto());
  }

  public async createLot(
    payload: CreateInventoryLotPayload,
    userId?: string,
    ipAddress?: string,
    correlationId?: string,
  ): Promise<InventoryLotDto> {
    const product = await this.productRepository.findById(payload.productId);
    if (!product) {
      throw new NotFoundException(`Producto con ID "${payload.productId}" no encontrado.`);
    }
    const controlMode = product.inventoryControlMode;
    if (controlMode === 'SERVICE') {
      throw new BadRequestException('Los productos SERVICE no pueden tener existencias manuales.');
    }

    if (controlMode === 'SIMPLE') {
      if (payload.lotNumber != null || payload.expirationDate != null) {
        throw new BadRequestException('El modo SIMPLE no permite lote ni vencimiento.');
      }
    } else if (controlMode === 'LOT') {
      if (!payload.lotNumber || payload.expirationDate != null) {
        throw new BadRequestException('El modo LOT requiere número de lote y prohíbe vencimiento.');
      }
    } else if (controlMode === 'LOT_EXPIRY') {
      if (!payload.lotNumber || !payload.expirationDate) {
        throw new BadRequestException('El modo LOT_EXPIRY requiere número de lote y vencimiento.');
      }
    } else if (controlMode === 'SERIAL') {
      if (!payload.lotNumber || payload.expirationDate != null) {
        throw new BadRequestException('El modo SERIAL requiere una serie y prohíbe vencimiento.');
      }
      const quantity = payload.initialQuantity ?? 0;
      if (quantity !== 0 && quantity !== 1) {
        throw new BadRequestException(
          'Una existencia SERIAL solo puede iniciar con cantidad 0 o 1.',
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      let location = await this.lotRepository.findLocationById(payload.locationId);
      if (!location) {
        // Intentar obtener o crear ubicación por defecto si no existe
        location = await this.lotRepository.findDefaultLocation();
        if (!location) {
          location = await this.lotRepository.saveLocation(
            new Location({
              code: 'DEF-01',
              name: 'Ubicación General',
              isDefault: true,
            }),
            tx,
          );
        }
      }

      const existingSimpleBalance =
        controlMode === 'SIMPLE'
          ? await this.lotRepository.findSimpleBalance(product.id, location.id)
          : null;
      if (existingSimpleBalance) {
        throw new ConflictException('Ya existe un saldo SIMPLE para este producto y ubicación.');
      }

      const existingLot = payload.lotNumber
        ? await this.lotRepository.findByProductLocationAndLotNumber(
            product.id,
            location.id,
            payload.lotNumber,
          )
        : null;

      if (existingLot) {
        throw new ConflictException(
          `Ya existe un lote con número "${payload.lotNumber}" para este producto en la ubicación seleccionada.`,
        );
      }

      try {
        const lot = InventoryLot.create({
          productId: product.id,
          locationId: location.id,
          lotNumber: payload.lotNumber ?? null,
          expirationDate: payload.expirationDate ?? null,
          controlMode,
          currentQuantity: payload.initialQuantity ?? 0,
        });

        const savedLot = await this.lotRepository.createWithInitialStock(lot, userId, tx);

        await this.auditService.recordEvent(
          {
            userId,
            action: 'CREATE_INVENTORY_LOT',
            entity: 'InventoryLot',
            entityId: savedLot.id,
            details: {
              productId: savedLot.productId,
              productCode: product.code,
              productName: product.name,
              lotNumber: savedLot.lotNumber,
              expirationDate: savedLot.expirationDate?.toISOString() ?? null,
              initialQuantity: savedLot.currentQuantity,
            },
            ipAddress,
            correlationId,
          },
          tx,
        );

        return savedLot.toDto();
      } catch (err: unknown) {
        if (err instanceof InventoryDomainException) {
          throw new BadRequestException(err.message);
        }
        if (isInventoryLotUniqueConflict(err)) {
          throw new ConflictException(
            'Ya existe una existencia con esa identidad para el producto y ubicación.',
          );
        }
        throw err;
      }
    });
  }

  // Métodos de Ubicaciones
  public async getLocations(): Promise<LocationDto[]> {
    const locations = await this.lotRepository.findAllLocations();
    if (locations.length === 0) {
      // Crear ubicación principal por defecto si está vacía
      const defaultLoc = await this.lotRepository.saveLocation(
        new Location({
          code: 'BOD-01',
          name: 'Bodega Principal',
          description: 'Ubicación central de almacenamiento de la farmacia',
          isDefault: true,
        }),
      );
      return [defaultLoc.toDto()];
    }
    return locations.map((loc) => loc.toDto());
  }

  public async createLocation(
    payload: CreateLocationPayload,
    userId?: string,
    ipAddress?: string,
    correlationId?: string,
  ): Promise<LocationDto> {
    const location = new Location({
      code: payload.code,
      name: payload.name,
      description: payload.description,
      isDefault: payload.isDefault ?? false,
    });

    return prisma.$transaction(async (tx) => {
      const saved = await this.lotRepository.saveLocation(location, tx);

      await this.auditService.recordEvent(
        {
          userId,
          action: 'CREATE_LOCATION',
          entity: 'Location',
          entityId: saved.id,
          details: {
            code: saved.code,
            name: saved.name,
          },
          ipAddress,
          correlationId,
        },
        tx,
      );

      return saved.toDto();
    });
  }
}

function isInventoryLotUniqueConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const normalizedTarget = (
    Array.isArray(target) ? target.join('_') : String(target ?? '')
  ).toLowerCase();
  const hasProductAndLocation =
    normalizedTarget.includes('product') && normalizedTarget.includes('location');
  return (
    hasProductAndLocation &&
    (!normalizedTarget.includes('lot') ||
      normalizedTarget.includes('lot_number') ||
      normalizedTarget.includes('lotnumber') ||
      normalizedTarget.includes('inventory_lots_simple_product_location_key') ||
      normalizedTarget.includes('inventory_lots_product_location_lot_number_key'))
  );
}
