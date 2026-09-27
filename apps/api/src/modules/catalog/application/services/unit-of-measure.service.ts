import { Injectable, Inject, ConflictException, NotFoundException } from '@nestjs/common';
import {
  UnitOfMeasureDto,
  CreateUnitOfMeasurePayload,
  UpdateUnitOfMeasurePayload,
  UnitOfMeasureQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { UnitOfMeasure } from '../../domain/entities/unit-of-measure.entity';
import {
  UNIT_OF_MEASURE_REPOSITORY,
  UnitOfMeasureRepositoryPort,
} from '../ports/unit-of-measure.repository.port';

@Injectable()
export class UnitOfMeasureService {
  constructor(
    @Inject(UNIT_OF_MEASURE_REPOSITORY)
    private readonly repository: UnitOfMeasureRepositoryPort
  ) {}

  public async create(payload: CreateUnitOfMeasurePayload): Promise<UnitOfMeasure> {
    const existingCode = await this.repository.findByCode(payload.code);
    if (existingCode) {
      throw new ConflictException(`Ya existe una unidad de medida con el código '${payload.code.toUpperCase()}'.`);
    }

    const existingName = await this.repository.findByName(payload.name);
    if (existingName) {
      throw new ConflictException(`Ya existe una unidad de medida con el nombre '${payload.name}'.`);
    }

    const unit = UnitOfMeasure.create({
      code: payload.code,
      name: payload.name,
      description: payload.description,
      category: payload.category,
    });

    return this.repository.save(unit);
  }

  public async update(id: string, payload: UpdateUnitOfMeasurePayload): Promise<UnitOfMeasure> {
    const unit = await this.repository.findById(id);
    if (!unit) {
      throw new NotFoundException(`Unidad de medida con ID '${id}' no encontrada.`);
    }

    if (payload.name && payload.name.trim().toLowerCase() !== unit.name.toLowerCase()) {
      const existingName = await this.repository.findByName(payload.name);
      if (existingName && existingName.id !== id) {
        throw new ConflictException(`Ya existe otra unidad de medida con el nombre '${payload.name}'.`);
      }
    }

    unit.update({
      name: payload.name,
      description: payload.description,
      category: payload.category,
      isActive: payload.isActive,
    });

    return this.repository.update(unit);
  }

  public async findById(id: string): Promise<UnitOfMeasure> {
    const unit = await this.repository.findById(id);
    if (!unit) {
      throw new NotFoundException(`Unidad de medida con ID '${id}' no encontrada.`);
    }
    return unit;
  }

  public async list(filters: UnitOfMeasureQueryFilters = {}): Promise<PaginatedResponse<UnitOfMeasureDto>> {
    const { items, total } = await this.repository.findAll(filters);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;

    return {
      items: items.map((u) => u.toDto()),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  public async deactivate(id: string): Promise<UnitOfMeasure> {
    const unit = await this.repository.findById(id);
    if (!unit) {
      throw new NotFoundException(`Unidad de medida con ID '${id}' no encontrada.`);
    }
    unit.deactivate();
    return this.repository.update(unit);
  }
}
