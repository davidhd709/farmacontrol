import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import { ProductPresentation } from '../../domain/entities/product-presentation.entity';
import type { ProductPresentationRepositoryPort } from '../../application/ports/product-presentation.repository.port';

const presentationInclude = {
  unitOfMeasure: true,
  containedPresentation: true,
} as const;

type PresentationRecordWithRelations = Prisma.ProductPresentationGetPayload<{
  include: typeof presentationInclude;
}>;

@Injectable()
export class PrismaProductPresentationRepository implements ProductPresentationRepositoryPort {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  public async findById(id: string): Promise<ProductPresentation | null> {
    const record = await this.client.productPresentation.findUnique({
      where: { id },
      include: presentationInclude,
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
      include: presentationInclude,
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
      include: presentationInclude,
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async listByProductId(
    productId: string,
    options?: { isActive?: boolean; purchaseEnabled?: boolean; saleEnabled?: boolean },
  ): Promise<ProductPresentation[]> {
    const where: Prisma.ProductPresentationWhereInput = {
      productId,
    };

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }
    if (options?.purchaseEnabled !== undefined) {
      where.purchaseEnabled = options.purchaseEnabled;
    }
    if (options?.saleEnabled !== undefined) {
      where.saleEnabled = options.saleEnabled;
    }

    const records = await this.client.productPresentation.findMany({
      where,
      include: presentationInclude,
      orderBy: [{ isDefault: 'desc' }, { conversionFactor: 'asc' }],
    });

    return records.map((r) => this.toDomain(r));
  }

  public async save(presentation: ProductPresentation): Promise<ProductPresentation> {
    const record = await this.client.productPresentation.create({
      data: {
        id: presentation.id,
        productId: presentation.productId,
        unitOfMeasureId: presentation.unitOfMeasureId,
        containedPresentationId: presentation.containedPresentationId,
        name: presentation.name,
        barcode: presentation.barcode,
        quantityContained: presentation.quantityContained,
        conversionFactor: presentation.conversionFactor,
        price: new Prisma.Decimal(presentation.price),
        cost: new Prisma.Decimal(presentation.cost),
        purchaseEnabled: presentation.purchaseEnabled,
        saleEnabled: presentation.saleEnabled,
        isDefault: presentation.isDefault,
        isDefaultPurchase: presentation.isDefaultPurchase,
        isDefaultSale: presentation.isDefaultSale,
        isActive: presentation.isActive,
        createdAt: presentation.createdAt,
        updatedAt: presentation.updatedAt,
      },
      include: presentationInclude,
    });

    return this.toDomain(record);
  }

  public async update(presentation: ProductPresentation): Promise<ProductPresentation> {
    const record = await this.client.productPresentation.update({
      where: { id: presentation.id },
      data: {
        unitOfMeasureId: presentation.unitOfMeasureId,
        containedPresentationId: presentation.containedPresentationId,
        name: presentation.name,
        barcode: presentation.barcode,
        quantityContained: presentation.quantityContained,
        conversionFactor: presentation.conversionFactor,
        price: new Prisma.Decimal(presentation.price),
        cost: new Prisma.Decimal(presentation.cost),
        purchaseEnabled: presentation.purchaseEnabled,
        saleEnabled: presentation.saleEnabled,
        isDefault: presentation.isDefault,
        isDefaultPurchase: presentation.isDefaultPurchase,
        isDefaultSale: presentation.isDefaultSale,
        isActive: presentation.isActive,
        updatedAt: presentation.updatedAt,
      },
      include: presentationInclude,
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
        isDefaultSale: false,
      },
    });
  }

  private toDomain(record: PresentationRecordWithRelations): ProductPresentation {
    return ProductPresentation.reconstitute({
      id: record.id,
      productId: record.productId,
      unitOfMeasureId: record.unitOfMeasureId,
      containedPresentationId: record.containedPresentationId,
      name: record.name,
      barcode: record.barcode,
      quantityContained: record.quantityContained,
      conversionFactor: record.conversionFactor,
      price: record.price.toFixed(2),
      cost: record.cost.toFixed(2),
      purchaseEnabled: record.purchaseEnabled,
      saleEnabled: record.saleEnabled,
      isDefault: record.isDefault,
      isDefaultPurchase: record.isDefaultPurchase,
      isDefaultSale: record.isDefaultSale,
      isActive: record.isActive,
      unitOfMeasureCode: record.unitOfMeasure?.code ?? null,
      unitOfMeasureName: record.unitOfMeasure?.name ?? null,
      containedPresentationName: record.containedPresentation?.name ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
