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
    const lots = await this.lotRepository.findAvailableLotsByProductFefo(
      productId,
      locationId,
    );
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
      throw new NotFoundException(
        `Producto con ID "${payload.productId}" no encontrado.`,
      );
    }

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
        );
      }
    }

    const existingLot =
      await this.lotRepository.findByProductLocationAndLotNumber(
        product.id,
        location.id,
        payload.lotNumber,
      );

    if (existingLot) {
      throw new ConflictException(
        `Ya existe un lote con número "${payload.lotNumber}" para este producto en la ubicación seleccionada.`,
      );
    }

    try {
      const lot = InventoryLot.create({
        productId: product.id,
        locationId: location.id,
        lotNumber: payload.lotNumber,
        expirationDate: payload.expirationDate,
        currentQuantity: payload.initialQuantity ?? 0,
      });

      const savedLot = await this.lotRepository.createWithOpeningBalance(lot, userId);

      await this.auditService.recordEvent({
        userId,
        action: 'CREATE_INVENTORY_LOT',
        entity: 'InventoryLot',
        entityId: savedLot.id,
        details: {
          productId: savedLot.productId,
          productCode: product.code,
          productName: product.name,
          lotNumber: savedLot.lotNumber,
          expirationDate: savedLot.expirationDate.toISOString(),
          initialQuantity: savedLot.currentQuantity,
        },
        ipAddress,
        correlationId,
      });

      return savedLot.toDto();
    } catch (err: any) {
      if (err.name === 'InventoryDomainException' || err.name === 'InvalidLotDataException') {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
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

    const saved = await this.lotRepository.saveLocation(location);

    await this.auditService.recordEvent({
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
    });

    return saved.toDto();
  }
}
