import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import type { UnitOfMeasureQueryFilters } from '@farmacia/contracts';
import { UnitOfMeasure } from '../../domain/entities/unit-of-measure.entity';
import type { UnitOfMeasureRepositoryPort } from '../../application/ports/unit-of-measure.repository.port';

@Injectable()
export class PrismaUnitOfMeasureRepository implements UnitOfMeasureRepositoryPort {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  public async findById(id: string): Promise<UnitOfMeasure | null> {
    const record = await this.client.unitOfMeasure.findUnique({
      where: { id },
    });
    return record ? this.toDomain(record) : null;
  }

  public async findByCode(code: string): Promise<UnitOfMeasure | null> {
    const trimmed = code.trim().toUpperCase();
    const record = await this.client.unitOfMeasure.findFirst({
      where: {
        code: {
          equals: trimmed,
          mode: 'insensitive',
        },
      },
    });
    return record ? this.toDomain(record) : null;
  }

  public async findByName(name: string): Promise<UnitOfMeasure | null> {
    const trimmed = name.trim();
    const record = await this.client.unitOfMeasure.findFirst({
      where: {
        name: {
          equals: trimmed,
          mode: 'insensitive',
        },
      },
    });
    return record ? this.toDomain(record) : null;
  }

  public async save(unit: UnitOfMeasure): Promise<UnitOfMeasure> {
    const record = await this.client.unitOfMeasure.create({
      data: {
        id: unit.id,
        code: unit.code,
        name: unit.name,
        description: unit.description,
        category: unit.category,
        isActive: unit.isActive,
        createdAt: unit.createdAt,
        updatedAt: unit.updatedAt,
      },
    });
    return this.toDomain(record);
  }

  public async update(unit: UnitOfMeasure): Promise<UnitOfMeasure> {
    const record = await this.client.unitOfMeasure.update({
      where: { id: unit.id },
      data: {
        name: unit.name,
        description: unit.description,
        category: unit.category,
        isActive: unit.isActive,
        updatedAt: unit.updatedAt,
      },
    });
    return this.toDomain(record);
  }

  public async findAll(
    filters: UnitOfMeasureQueryFilters = {}
  ): Promise<{ items: UnitOfMeasure[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
    const skip = (page - 1) * pageSize;

    const where: Prisma.UnitOfMeasureWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.category && filters.category.trim()) {
      where.category = { equals: filters.category.trim().toUpperCase() };
    }

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [records, total] = await Promise.all([
      this.client.unitOfMeasure.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip,
        take: pageSize,
      }),
      this.client.unitOfMeasure.count({ where }),
    ]);

    return {
      items: records.map((r) => this.toDomain(r)),
      total,
    };
  }

  private toDomain(record: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    category: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): UnitOfMeasure {
    return UnitOfMeasure.reconstitute({
      id: record.id,
      code: record.code,
      name: record.name,
      description: record.description,
      category: record.category,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
