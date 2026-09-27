import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  CreateProductPayload,
  PaginatedResponse,
  ProductDto,
  ProductQueryFilters,
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
import { AuditService } from '../../../audit/application/services/audit.service';
import type { AuditContext } from './category.service';

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

    const product = Product.create({
      ...input,
      categoryName: category.name,
    });

    const saved = await this.productRepository.save(product);

    if (this.auditService) {
      await this.auditService.recordEvent({
        userId: auditCtx?.userId || null,
        action: 'catalog:product_created',
        entity: 'Product',
        entityId: saved.id,
        details: {
          code: saved.code,
          barcode: saved.barcode,
          name: saved.name,
          categoryId: saved.categoryId,
          requiresLotControl: saved.requiresLotControl,
          basePrice: saved.basePrice,
        },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return saved;
  }

  public async getProductById(id: string): Promise<Product> {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new ProductNotFoundException(id);
    }
    return product;
  }

  public async updateProduct(
    id: string,
    input: UpdateProductPayload,
    auditCtx?: AuditContext,
  ): Promise<Product> {
    const product = await this.getProductById(id);

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

    product.update({
      ...input,
      categoryName,
    });

    const updated = await this.productRepository.update(product);

    if (this.auditService) {
      await this.auditService.recordEvent({
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
      });
    }

    return updated;
  }

  public async deactivateProduct(id: string, auditCtx?: AuditContext): Promise<Product> {
    const product = await this.getProductById(id);

    product.deactivate();
    const updated = await this.productRepository.update(product);

    if (this.auditService) {
      await this.auditService.recordEvent({
        userId: auditCtx?.userId || null,
        action: 'catalog:product_deactivated',
        entity: 'Product',
        entityId: updated.id,
        details: { code: updated.code, name: updated.name },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return updated;
  }

  public async listProducts(
    filters: ProductQueryFilters = {},
  ): Promise<PaginatedResponse<ProductDto>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

    const { items, total } = await this.productRepository.findAll(filters);

    return {
      items: items.map((p) => p.toDto()),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
