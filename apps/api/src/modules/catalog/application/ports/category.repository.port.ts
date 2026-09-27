import { CategoryQueryFilters } from '@farmacia/contracts';
import { Category } from '../../domain/entities/category.entity';

export const CATEGORY_REPOSITORY_PORT = Symbol('CATEGORY_REPOSITORY_PORT');

export interface CategoryRepositoryPort {
  create(category: Category, tx?: unknown): Promise<Category>;
  update(category: Category, tx?: unknown): Promise<Category>;
  findById(id: string): Promise<Category | null>;
  findByName(name: string): Promise<Category | null>;
  findAll(filters: CategoryQueryFilters): Promise<{ items: Category[]; total: number }>;
  hasActiveProducts(categoryId: string): Promise<boolean>;
}
