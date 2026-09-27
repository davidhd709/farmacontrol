import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import { CategoryQueryFilters } from '@farmacia/contracts';
import { CategoryRepositoryPort } from '../../application/ports/category.repository.port';
import { Category } from '../../domain/entities/category.entity';

@Injectable()
export class PrismaCategoryRepository implements CategoryRepositoryPort {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  public async create(category: Category, tx?: unknown): Promise<Category> {
    const db = (tx as Prisma.TransactionClient) ?? this.client;

    const record = await db.category.create({
      data: {
        id: category.id,
        name: category.name,
        description: category.description,
        isActive: category.isActive,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      },
    });

    return this.toDomain(record);
  }

  public async update(category: Category, tx?: unknown): Promise<Category> {
    const db = (tx as Prisma.TransactionClient) ?? this.client;

    const record = await db.category.update({
      where: { id: category.id },
      data: {
        name: category.name,
        description: category.description,
        isActive: category.isActive,
        updatedAt: category.updatedAt,
      },
    });

    return this.toDomain(record);
  }

  public async findById(id: string): Promise<Category | null> {
    const record = await this.client.category.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async findByName(name: string): Promise<Category | null> {
    const trimmed = name.trim();
    const record = await this.client.category.findFirst({
      where: {
        name: {
          equals: trimmed,
          mode: 'insensitive',
        },
      },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async findAll(
    filters: CategoryQueryFilters
  ): Promise<{ items: Category[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.CategoryWhereInput = {};

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    } else {
      where.isActive = true;
    }

    const [records, total] = await Promise.all([
      this.client.category.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      this.client.category.count({ where }),
    ]);

    return {
      items: records.map((r) => this.toDomain(r)),
      total,
    };
  }

  public async hasActiveProducts(categoryId: string): Promise<boolean> {
    const count = await this.client.product.count({
      where: { categoryId, isActive: true },
    });
    return count > 0;
  }

  private toDomain(record: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Category {
    return Category.reconstitute({
      id: record.id,
      name: record.name,
      description: record.description,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
