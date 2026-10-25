import { businessToday } from '../../../../common/utils/business-date';
import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import type {
  CreateProductPayload,
  PaginatedResponse,
  ProductDto,
  ProductQueryFilters,
  ProductSettingsDto,
  UpdateProductPayload,
} from '@farmacia/contracts';
import {
  PRODUCT_REPOSITORY_PORT,
  type ProductRepositoryPort,
} from '../ports/product.repository.port';
import {
  CATEGORY_REPOSITORY_PORT,
  type CategoryRepositoryPort,
} from '../ports/category.repository.port';
import { Product } from '../../domain/entities/product.entity';
import {
  ProductBarcodeAlreadyExistsException,
  ProductCategoryNotFoundException,
  ProductCodeAlreadyExistsException,
  ProductNotFoundException,
} from '../../domain/exceptions/product.exceptions';
import { prisma, Prisma } from '@farmacia/database';
import { AuditService } from '../../../audit/application/services/audit.service';
import type { AuditContext } from './category.service';
import { sectorProfileRules } from '../../../company/application/sector-profile.reader';
import { saleTaxRatesAt } from '../../../taxes/application/tax-context.reader';

@Injectable()
export class ProductService {
  constructor(
    @Inject(PRODUCT_REPOSITORY_PORT)
    private readonly productRepository: ProductRepositoryPort,
    @Inject(CATEGORY_REPOSITORY_PORT)
    private readonly categoryRepository: CategoryRepositoryPort,
    @Optional()
    private readonly auditService?: AuditService,
  ) {}

  public async createProduct(
    input: CreateProductPayload,
    auditCtx?: AuditContext,
  ): Promise<Product> {
    const category = await this.categoryRepository.findById(input.categoryId);
    if (!category || !category.isActive) {
      throw new ProductCategoryNotFoundException(input.categoryId);
    }

    const existingCode = await this.productRepository.findByCode(input.code);
    if (existingCode) {
      throw new ProductCodeAlreadyExistsException(input.code.trim());
    }

    if (input.barcode && input.barcode.trim()) {
      const existingBarcode = await this.productRepository.findByBarcode(input.barcode);
      if (existingBarcode) {
        throw new ProductBarcodeAlreadyExistsException(input.barcode.trim());
      }
    }

    const { rules } = await sectorProfileRules();
    const product = Product.create(
      {
        ...input,
        categoryName: category.name,
      },
      rules,
    );

    const persist = async (tx?: Prisma.TransactionClient) => {
      const saved = await this.productRepository.save(product, tx);

      if (this.auditService) {
        await this.auditService.recordEvent(
          {
            userId: auditCtx?.userId || null,
            action: 'catalog:product_created',
            entity: 'Product',
            entityId: saved.id,
            details: {
              code: saved.code,
              barcode: saved.barcode,
              name: saved.name,
              categoryId: saved.categoryId,
              inventoryControlMode: saved.inventoryControlMode,
              basePrice: saved.basePrice,
            },
            ipAddress: auditCtx?.ipAddress || null,
            correlationId: auditCtx?.correlationId || null,
          },
          tx,
        );
      }

      return saved;
    };
    return this.auditService ? prisma.$transaction(persist) : persist();
  }

  public async getProductById(id: string): Promise<Product> {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new ProductNotFoundException(id);
    }
    return product;
  }

  public async getProductDtoById(id: string): Promise<ProductDto> {
    const product = await this.getProductById(id);
    const stockAgg = await prisma.$queryRaw<Array<{ total_stock: number }>>`
      SELECT COALESCE(SUM(current_quantity), 0)::int AS total_stock
      FROM inventory_lots
      WHERE product_id = ${id}::uuid
        AND is_active = true
        AND current_quantity > 0
        AND (expiration_date IS NULL OR expiration_date >= ${businessToday()}::date)
    `;
    const saleTax = (await saleTaxRatesAt(prisma, [id], businessToday()))?.get(id);
    // Un servicio no maneja existencias: no informa saldo para que el POS no lo trate como agotado
    const dto =
      product.inventoryControlMode === 'SERVICE'
        ? product.toDto()
        : product.toDto(stockAgg[0]?.total_stock ?? 0);
    return saleTax ? { ...dto, saleTax } : dto;
  }

  public async updateProduct(
    id: string,
    input: UpdateProductPayload,
    auditCtx?: AuditContext,
  ): Promise<Product> {
    const product = await this.getProductById(id);

    const { rules } = await sectorProfileRules();
    if (
      input.inventoryControlMode !== undefined &&
      input.inventoryControlMode !== product.inventoryControlMode &&
      (await this.productRepository.hasInventoryHistory(id))
    ) {
      throw new ConflictException(
        'No se puede cambiar el modo de control porque el producto ya tiene existencias registradas.',
      );
    }

    let categoryName = product.categoryName;
    if (input.categoryId && input.categoryId !== product.categoryId) {
      const category = await this.categoryRepository.findById(input.categoryId);
      if (!category || !category.isActive) {
        throw new ProductCategoryNotFoundException(input.categoryId);
      }
      categoryName = category.name;
    }

    if (input.code && input.code.trim().toLowerCase() !== product.code.toLowerCase()) {
      const existingCode = await this.productRepository.findByCode(input.code);
      if (existingCode && existingCode.id !== product.id) {
        throw new ProductCodeAlreadyExistsException(input.code.trim());
      }
    }

    if (
      input.barcode &&
      input.barcode.trim().toLowerCase() !== (product.barcode?.toLowerCase() ?? '')
    ) {
      const existingBarcode = await this.productRepository.findByBarcode(input.barcode);
      if (existingBarcode && existingBarcode.id !== product.id) {
        throw new ProductBarcodeAlreadyExistsException(input.barcode.trim());
      }
    }

    product.update({ ...input, categoryName }, rules);

    const persist = async (tx?: Prisma.TransactionClient) => {
      const updated = await this.productRepository.update(product, tx);

      if (this.auditService) {
        await this.auditService.recordEvent(
          {
            userId: auditCtx?.userId || null,
            action: 'catalog:product_updated',
            entity: 'Product',
            entityId: updated.id,
            details: {
              code: updated.code,
              name: updated.name,
              categoryId: updated.categoryId,
              isActive: updated.isActive,
              basePrice: updated.basePrice,
            },
            ipAddress: auditCtx?.ipAddress || null,
            correlationId: auditCtx?.correlationId || null,
          },
          tx,
        );
      }

      return updated;
    };
    try {
      return this.auditService ? await prisma.$transaction(persist) : await persist();
    } catch (error) {
      if (isInventoryControlModeLockedError(error)) {
        throw new ConflictException(
          'No se puede cambiar el modo de control porque el producto ya tiene existencias registradas.',
        );
      }
      throw error;
    }
  }

  public async deactivateProduct(id: string, auditCtx?: AuditContext): Promise<Product> {
    const product = await this.getProductById(id);

    product.deactivate();
    const persist = async (tx?: Prisma.TransactionClient) => {
      const updated = await this.productRepository.update(product, tx);

      if (this.auditService) {
        await this.auditService.recordEvent(
          {
            userId: auditCtx?.userId || null,
            action: 'catalog:product_deactivated',
            entity: 'Product',
            entityId: updated.id,
            details: { code: updated.code, name: updated.name },
            ipAddress: auditCtx?.ipAddress || null,
            correlationId: auditCtx?.correlationId || null,
          },
          tx,
        );
      }

      return updated;
    };
    return this.auditService ? prisma.$transaction(persist) : persist();
  }

  public async listProducts(
    filters: ProductQueryFilters = {},
  ): Promise<PaginatedResponse<ProductDto>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

    const { items, total } = await this.productRepository.findAll(filters);

    const productIds = items.map((p) => p.id);
    const stockMap = new Map<string, number>();

    if (productIds.length > 0) {
      const lotStockAggs = await prisma.$queryRaw<
        Array<{ product_id: string; total_stock: number }>
      >`
        SELECT product_id, COALESCE(SUM(current_quantity), 0)::int AS total_stock
        FROM inventory_lots
        WHERE product_id IN (${Prisma.join(productIds.map((id) => Prisma.sql`${id}::uuid`))})
          AND is_active = true
          AND current_quantity > 0
          AND (expiration_date IS NULL OR expiration_date >= ${businessToday()}::date)
        GROUP BY product_id
      `;

      for (const agg of lotStockAggs) {
        stockMap.set(agg.product_id, agg.total_stock);
      }
    }

    // F6: tarifas de venta vigentes para que el POS calcule igual que el backend
    const saleTaxes = await saleTaxRatesAt(prisma, productIds, businessToday());

    return {
      items: items.map((p) => {
        const dto =
          p.inventoryControlMode === 'SERVICE' ? p.toDto() : p.toDto(stockMap.get(p.id) ?? 0);
        const saleTax = saleTaxes?.get(p.id);
        return saleTax ? { ...dto, saleTax } : dto;
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  public async getProductSettings(): Promise<ProductSettingsDto> {
    const { sectorProfile, rules } = await sectorProfileRules();
    return {
      sectorProfile,
      defaultControlMode: rules.defaultControlMode,
      allowedControlModes: [...rules.allowedControlModes],
      prescriptionRequiredControlMode: rules.prescriptionRequiredControlMode,
    };
  }
}

function isInventoryControlModeLockedError(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    (error.code !== 'P2004' && error.code !== 'P2010')
  )
    return false;
  const detail = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
  return detail.includes('INVENTORY_CONTROL_MODE_LOCKED:');
}
