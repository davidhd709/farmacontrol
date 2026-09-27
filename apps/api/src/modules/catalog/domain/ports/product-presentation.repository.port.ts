import type { ProductPresentation } from '../entities/product-presentation.entity';

export const PRODUCT_PRESENTATION_REPOSITORY = Symbol('PRODUCT_PRESENTATION_REPOSITORY');

export interface ProductPresentationRepositoryPort {
  create(presentation: ProductPresentation): Promise<ProductPresentation>;
  findById(id: string): Promise<ProductPresentation | null>;
  findByProductIdAndName(productId: string, name: string): Promise<ProductPresentation | null>;
  findByBarcode(barcode: string): Promise<ProductPresentation | null>;
  listByProductId(
    productId: string,
    options?: { isActive?: boolean },
  ): Promise<ProductPresentation[]>;
  update(presentation: ProductPresentation): Promise<ProductPresentation>;
  delete(id: string): Promise<void>;
  unsetDefaultPresentations(productId: string, exceptId?: string): Promise<void>;
}
