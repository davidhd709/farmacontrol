import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import type { ProductQueryFilters } from '@farmacia/contracts';
import { Product } from '../../domain/entities/product.entity';
import type { ProductRepositoryPort } from '../../application/ports/product.repository.port';

const PRODUCT_INCLUDE = {
  category: {
    select: { name: true },
  },
  presentations: {
    where: { isActive: true },
    include: {
      unitOfMeasure: true,
      containedPresentation: true,
    },
    orderBy: { conversionFactor: 'asc' as const },
  },
};

@Injectable()
export class PrismaProductRepository implements ProductRepositoryPort {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  public async findById(id: string): Promise<Product | null> {
    const record = await this.client.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async findByCode(code: string): Promise<Product | null> {
    const trimmed = code.trim();
    const record = await this.client.product.findFirst({
      where: {
        code: {
          equals: trimmed,
          mode: 'insensitive',
        },
      },
      include: PRODUCT_INCLUDE,
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async findByBarcode(barcode: string): Promise<Product | null> {
    const trimmed = barcode.trim();
    const record = await this.client.product.findFirst({
      where: {
        barcode: {
          equals: trimmed,
          mode: 'insensitive',
        },
      },
      include: PRODUCT_INCLUDE,
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async save(product: Product): Promise<Product> {
    const record = await this.client.product.create({
      data: {
        id: product.id,
        categoryId: product.categoryId,
        code: product.code,
        barcode: product.barcode,
        name: product.name,
        genericName: product.genericName,
        concentration: product.concentration,
        sanitaryRegistry: product.sanitaryRegistry,
        manufacturer: product.manufacturer,
        description: product.description,
        requiresLotControl: product.requiresLotControl,
        prescriptionRequired: product.prescriptionRequired,
        baseUnit: product.baseUnit,
        basePrice: new Prisma.Decimal(product.basePrice),
        baseCost: new Prisma.Decimal(product.baseCost),
        isActive: product.isActive,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
      include: {
        category: {
          select: { name: true },
        },
      },
    });

    return this.toDomain(record);
  }

  public async update(product: Product): Promise<Product> {
    const record = await this.client.product.update({
      where: { id: product.id },
      data: {
        categoryId: product.categoryId,
        code: product.code,
        barcode: product.barcode,
        name: product.name,
        genericName: product.genericName,
        concentration: product.concentration,
        sanitaryRegistry: product.sanitaryRegistry,
        manufacturer: product.manufacturer,
        description: product.description,
        requiresLotControl: product.requiresLotControl,
        prescriptionRequired: product.prescriptionRequired,
        baseUnit: product.baseUnit,
        basePrice: new Prisma.Decimal(product.basePrice),
        baseCost: new Prisma.Decimal(product.baseCost),
        isActive: product.isActive,
        updatedAt: product.updatedAt,
      },
      include: {
        category: {
          select: { name: true },
        },
      },
    });

    return this.toDomain(record);
  }

  public async findAll(
    filters: ProductQueryFilters = {},
  ): Promise<{ items: Product[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.ProductWhereInput = {};

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.requiresLotControl !== undefined) {
      where.requiresLotControl = filters.requiresLotControl;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    } else {
      where.isActive = true;
    }

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { genericName: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
        { barcode: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [records, total] = await Promise.all([
      this.client.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
        include: PRODUCT_INCLUDE,
      }),
      this.client.product.count({ where }),
    ]);

    return {
      items: records.map((r) => this.toDomain(r)),
      total,
    };
  }

  private toDomain(record: {
    id: string;
    categoryId: string;
    code: string;
    barcode: string | null;
    name: string;
    genericName: string | null;
    concentration: string | null;
    sanitaryRegistry: string | null;
    manufacturer: string | null;
    description: string | null;
    requiresLotControl: boolean;
    prescriptionRequired: boolean;
    baseUnit: string;
    basePrice: Prisma.Decimal;
    baseCost: Prisma.Decimal;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    category?: { name: string } | null;
    presentations?: Array<{
      id: string;
      productId: string;
      unitOfMeasureId?: string | null;
      containedPresentationId?: string | null;
      name: string;
      barcode: string | null;
      quantityContained: number;
      conversionFactor: number;
      price: Prisma.Decimal;
      cost: Prisma.Decimal;
      purchaseEnabled: boolean;
      saleEnabled: boolean;
      isDefault: boolean;
      isDefaultPurchase: boolean;
      isDefaultSale: boolean;
      isActive: boolean;
      unitOfMeasure?: { code: string; name: string } | null;
      containedPresentation?: { name: string } | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }): Product {
    return Product.reconstitute({
      id: record.id,
      categoryId: record.categoryId,
      categoryName: record.category?.name ?? null,
      code: record.code,
      barcode: record.barcode,
      name: record.name,
      genericName: record.genericName,
      concentration: record.concentration,
      sanitaryRegistry: record.sanitaryRegistry,
      manufacturer: record.manufacturer,
      description: record.description,
      requiresLotControl: record.requiresLotControl,
      prescriptionRequired: record.prescriptionRequired,
      baseUnit: record.baseUnit,
      basePrice: record.basePrice.toFixed(2),
      baseCost: record.baseCost.toFixed(2),
      isActive: record.isActive,
      presentations: record.presentations?.map((p) => ({
        id: p.id,
        productId: p.productId,
        unitOfMeasureId: p.unitOfMeasureId ?? null,
        unitOfMeasureCode: p.unitOfMeasure?.code ?? null,
        unitOfMeasureName: p.unitOfMeasure?.name ?? null,
        containedPresentationId: p.containedPresentationId ?? null,
        containedPresentationName: p.containedPresentation?.name ?? null,
        name: p.name,
        barcode: p.barcode,
        quantityContained: p.quantityContained,
        conversionFactor: p.conversionFactor,
        baseFactor: p.conversionFactor,
        price: p.price.toFixed(2),
        cost: p.cost.toFixed(2),
        purchaseEnabled: p.purchaseEnabled,
        saleEnabled: p.saleEnabled,
        isDefault: p.isDefault,
        isDefaultPurchase: p.isDefaultPurchase,
        isDefaultSale: p.isDefaultSale,
        isActive: p.isActive,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
