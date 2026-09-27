import type { ProductQueryFilters } from '@farmacia/contracts';
import type { Product } from '../../domain/entities/product.entity';

export interface ProductRepositoryPort {
  findById(id: string): Promise<Product | null>;
  findByCode(code: string): Promise<Product | null>;
  findByBarcode(barcode: string): Promise<Product | null>;
  save(product: Product): Promise<Product>;
  update(product: Product): Promise<Product>;
  findAll(filters: ProductQueryFilters): Promise<{ items: Product[]; total: number }>;
}

export const PRODUCT_REPOSITORY_PORT = Symbol('PRODUCT_REPOSITORY_PORT');
