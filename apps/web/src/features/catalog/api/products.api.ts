import type {
  CreateProductPayload,
  PaginatedResponse,
  ProductDto,
  ProductPresentationDto,
  ProductQueryFilters,
  UpdateProductPayload,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchProducts(
  filters: ProductQueryFilters = {},
  options: { signal?: AbortSignal } = {},
): Promise<PaginatedResponse<ProductDto>> {
  const query = new URLSearchParams();

  if (filters.search?.trim()) {
    query.set('search', filters.search.trim());
  }

  if (filters.categoryId) {
    query.set('categoryId', filters.categoryId);
  }

  if (filters.requiresLotControl !== undefined) {
    query.set('requiresLotControl', String(filters.requiresLotControl));
  }

  if (filters.isActive !== undefined) {
    query.set('isActive', String(filters.isActive));
  }

  if (filters.page !== undefined) {
    query.set('page', String(filters.page));
  }

  if (filters.pageSize !== undefined) {
    query.set('pageSize', String(filters.pageSize));
  }

  const queryString = query.toString();
  const endpoint = queryString ? `products?${queryString}` : 'products';

  return apiRequest<PaginatedResponse<ProductDto>>(endpoint, {
    method: 'GET',
    signal: options.signal,
  });
}

export async function fetchProductById(id: string): Promise<ProductDto> {
  return apiRequest<ProductDto>(`products/${id}`, {
    method: 'GET',
  });
}

export async function createProduct(payload: CreateProductPayload): Promise<ProductDto> {
  return apiRequest<ProductDto>('products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProduct(
  id: string,
  payload: UpdateProductPayload,
): Promise<ProductDto> {
  return apiRequest<ProductDto>(`products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deactivateProduct(id: string): Promise<ProductDto> {
  return apiRequest<ProductDto>(`products/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchProductPresentations(productId: string): Promise<ProductPresentationDto[]> {
  return apiRequest<ProductPresentationDto[]>(`products/${productId}/presentations`, {
    method: 'GET',
  });
}
