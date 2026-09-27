import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CategoryDto,
  CreateCategoryPayload,
  UpdateCategoryPayload,
  CategoryQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import {
  CATEGORY_REPOSITORY_PORT,
  CategoryRepositoryPort,
} from '../ports/category.repository.port';
import { Category } from '../../domain/entities/category.entity';
import {
  CategoryNotFoundException,
  CategoryAlreadyExistsException,
  CategoryHasActiveProductsException,
} from '../../domain/exceptions/category.exceptions';
import { AuditService } from '../../../audit/application/services/audit.service';

export interface AuditContext {
  userId?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class CategoryService {
  constructor(
    @Inject(CATEGORY_REPOSITORY_PORT)
    private readonly categoryRepository: CategoryRepositoryPort,
    @Optional()
    private readonly auditService?: AuditService
  ) {}

  public async createCategory(
    input: CreateCategoryPayload,
    auditCtx?: AuditContext
  ): Promise<Category> {
    const existing = await this.categoryRepository.findByName(input.name);
    if (existing) {
      throw new CategoryAlreadyExistsException(input.name.trim());
    }

    const category = Category.create({
      name: input.name,
      description: input.description,
    });

    const saved = await this.categoryRepository.create(category);

    if (this.auditService) {
      await this.auditService.recordEvent({
        userId: auditCtx?.userId || null,
        action: 'catalog:category_created',
        entity: 'Category',
        entityId: saved.id,
        details: { name: saved.name, description: saved.description },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return saved;
  }

  public async updateCategory(
    id: string,
    input: UpdateCategoryPayload,
    auditCtx?: AuditContext
  ): Promise<Category> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new CategoryNotFoundException(id);
    }

    if (
      input.name &&
      input.name.trim().toLowerCase() !== category.name.toLowerCase()
    ) {
      const existing = await this.categoryRepository.findByName(input.name);
      if (existing && existing.id !== id) {
        throw new CategoryAlreadyExistsException(input.name.trim());
      }
    }

    const previousState = {
      name: category.name,
      description: category.description,
      isActive: category.isActive,
    };

    category.update(input);

    const updated = await this.categoryRepository.update(category);

    if (this.auditService) {
      await this.auditService.recordEvent({
        userId: auditCtx?.userId || null,
        action: 'catalog:category_updated',
        entity: 'Category',
        entityId: updated.id,
        details: {
          previous: previousState,
          updated: {
            name: updated.name,
            description: updated.description,
            isActive: updated.isActive,
          },
        },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return updated;
  }

  public async deactivateCategory(
    id: string,
    auditCtx?: AuditContext
  ): Promise<Category> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new CategoryNotFoundException(id);
    }

    const hasActiveProducts = await this.categoryRepository.hasActiveProducts(id);
    if (hasActiveProducts) {
      throw new CategoryHasActiveProductsException(category.name);
    }

    category.deactivate();

    const deactivated = await this.categoryRepository.update(category);

    if (this.auditService) {
      await this.auditService.recordEvent({
        userId: auditCtx?.userId || null,
        action: 'catalog:category_deactivated',
        entity: 'Category',
        entityId: deactivated.id,
        details: { name: deactivated.name },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return deactivated;
  }

  public async getCategoryById(id: string): Promise<Category> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new CategoryNotFoundException(id);
    }
    return category;
  }

  public async listCategories(
    filters: CategoryQueryFilters
  ): Promise<PaginatedResponse<CategoryDto>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

    const { items, total } = await this.categoryRepository.findAll({
      ...filters,
      page,
      pageSize,
    });

    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      items: items.map((cat) => cat.toDto()),
      total,
      page,
      pageSize,
      totalPages,
    };
  }
}
