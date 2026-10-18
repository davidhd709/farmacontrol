import type { ProductPresentation } from '../../domain/entities/product-presentation.entity';

export interface ProductPresentationRepositoryPort {
  findById(id: string): Promise<ProductPresentation | null>;
  findByProductIdAndName(productId: string, name: string): Promise<ProductPresentation | null>;
  findByBarcode(barcode: string): Promise<ProductPresentation | null>;
  listByProductId(
    productId: string,
    options?: { isActive?: boolean; purchaseEnabled?: boolean; saleEnabled?: boolean },
  ): Promise<ProductPresentation[]>;
  save(presentation: ProductPresentation, tx?: unknown): Promise<ProductPresentation>;
  update(presentation: ProductPresentation, tx?: unknown): Promise<ProductPresentation>;
  updateAndPropagateFactors(
    presentation: ProductPresentation,
    tx?: unknown,
  ): Promise<ProductPresentation>;
  unsetDefaultPresentations(productId: string, exceptId?: string, tx?: unknown): Promise<void>;
}

export const PRODUCT_PRESENTATION_REPOSITORY_PORT = Symbol('PRODUCT_PRESENTATION_REPOSITORY_PORT');
