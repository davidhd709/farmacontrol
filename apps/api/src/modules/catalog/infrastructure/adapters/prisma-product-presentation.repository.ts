import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import { ProductPresentation } from '../../domain/entities/product-presentation.entity';
import type { ProductPresentationRepositoryPort } from '../../application/ports/product-presentation.repository.port';

@Injectable()
export class PrismaProductPresentationRepository implements ProductPresentationRepositoryPort {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  public async findById(id: string): Promise<ProductPresentation | null> {
    const record = await this.client.productPresentation.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async findByProductIdAndName(
    productId: string,
    name: string,
  ): Promise<ProductPresentation | null> {
    const trimmed = name.trim();
    const record = await this.client.productPresentation.findFirst({
      where: {
        productId,
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

  public async findByBarcode(barcode: string): Promise<ProductPresentation | null> {
    const trimmed = barcode.trim();
    const record = await this.client.productPresentation.findFirst({
      where: {
        barcode: {
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

  public async listByProductId(
    productId: string,
    options?: { isActive?: boolean },
  ): Promise<ProductPresentation[]> {
    const where: Prisma.ProductPresentationWhereInput = {
      productId,
    };

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    const records = await this.client.productPresentation.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { conversionFactor: 'asc' }],
    });

    return records.map((r) => this.toDomain(r));
  }

  public async save(presentation: ProductPresentation): Promise<ProductPresentation> {
    const record = await this.client.productPresentation.create({
      data: {
        id: presentation.id,
        productId: presentation.productId,
        name: presentation.name,
        barcode: presentation.barcode,
        conversionFactor: presentation.conversionFactor,
        price: new Prisma.Decimal(presentation.price),
        cost: new Prisma.Decimal(presentation.cost),
        isDefault: presentation.isDefault,
        isActive: presentation.isActive,
        createdAt: presentation.createdAt,
        updatedAt: presentation.updatedAt,
      },
    });

    return this.toDomain(record);
  }

  public async update(presentation: ProductPresentation): Promise<ProductPresentation> {
    const record = await this.client.productPresentation.update({
      where: { id: presentation.id },
      data: {
        name: presentation.name,
        barcode: presentation.barcode,
        conversionFactor: presentation.conversionFactor,
        price: new Prisma.Decimal(presentation.price),
        cost: new Prisma.Decimal(presentation.cost),
        isDefault: presentation.isDefault,
        isActive: presentation.isActive,
        updatedAt: presentation.updatedAt,
      },
    });

    return this.toDomain(record);
  }

  public async unsetDefaultPresentations(productId: string, exceptId?: string): Promise<void> {
    await this.client.productPresentation.updateMany({
      where: {
        productId,
        isDefault: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: {
        isDefault: false,
      },
    });
  }

  private toDomain(record: {
    id: string;
    productId: string;
    name: string;
    barcode: string | null;
    conversionFactor: number;
    price: Prisma.Decimal;
    cost: Prisma.Decimal;
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ProductPresentation {
    return ProductPresentation.reconstitute({
      id: record.id,
      productId: record.productId,
      name: record.name,
      barcode: record.barcode,
      conversionFactor: record.conversionFactor,
      price: record.price.toFixed(2),
      cost: record.cost.toFixed(2),
      isDefault: record.isDefault,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
