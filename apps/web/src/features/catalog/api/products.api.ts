import type {
  CreateProductPayload,
  PaginatedResponse,
  ProductBarcodeLookupDto,
  ProductDto,
  ProductImportPreviewDto,
  ProductPresentationDto,
  ProductQueryFilters,
  ProductSettingsDto,
  UpdateProductPayload,
} from '@farmacia/contracts';
import { ApiError, apiRequest } from '../../../api/http-client';

export async function fetchProducts(
  filters: ProductQueryFilters = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<ProductDto>> {
  const query = new URLSearchParams();

  if (filters.search?.trim()) {
    query.set('search', filters.search.trim());
  }

  if (filters.categoryId) {
    query.set('categoryId', filters.categoryId);
  }

  if (filters.inventoryControlMode) {
    query.set('inventoryControlMode', filters.inventoryControlMode);
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
    signal,
  });
}

/** Modo de control por defecto y modos permitidos según el perfil sectorial vigente. */
export async function fetchProductSettings(): Promise<ProductSettingsDto> {
  return apiRequest<ProductSettingsDto>('products/settings', { method: 'GET' });
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

export async function fetchProductPresentations(
  productId: string,
): Promise<ProductPresentationDto[]> {
  return apiRequest<ProductPresentationDto[]>(`products/${productId}/presentations`, {
    method: 'GET',
  });
}

/**
 * Lector de código de barras: producto cuyo código de barras (del producto o de una
 * presentación) o código interno coincide exactamente. null si no existe.
 */
export async function lookupProductByCode(
  code: string,
  signal?: AbortSignal,
): Promise<ProductBarcodeLookupDto | null> {
  try {
    return await apiRequest<ProductBarcodeLookupDto>(
      `products/barcode/${encodeURIComponent(code.trim())}`,
      { method: 'GET', signal },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

const apiUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

async function fileRequest(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/${path}`, { ...init, credentials: 'include' });
  } catch {
    throw new ApiError('No fue posible comunicarse con el servidor. Verifica tu conexión.', 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    throw new ApiError(message || 'No fue posible procesar el archivo.', response.status, body);
  }
  return response;
}

export async function downloadProductTemplate(): Promise<void> {
  const response = await fileRequest('products/import/template', { method: 'GET' });
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_productos.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportProductsToExcel(filters: ProductQueryFilters = {}): Promise<void> {
  const query = new URLSearchParams();
  if (filters.search?.trim()) query.set('search', filters.search.trim());
  if (filters.categoryId) query.set('categoryId', filters.categoryId);
  if (filters.inventoryControlMode) query.set('inventoryControlMode', filters.inventoryControlMode);
  if (filters.isActive !== undefined) query.set('isActive', String(filters.isActive));
  const qs = query.toString();
  const endpoint = qs ? `products/export?${qs}` : 'products/export';

  const response = await fileRequest(endpoint, { method: 'GET' });
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = 'catalogo_productos.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function previewProductImport(file: File): Promise<ProductImportPreviewDto> {
  const form = new FormData();
  form.append('file', file);
  const response = await fileRequest('products/import/preview', { method: 'POST', body: form });
  return (await response.json()) as ProductImportPreviewDto;
}

export async function confirmProductImport(
  file: File,
  previewHash: string,
): Promise<{ importedCount: number }> {
  const form = new FormData();
  form.append('file', file);
  form.append('previewHash', previewHash);
  const response = await fileRequest('products/import/confirm', { method: 'POST', body: form });
  return (await response.json()) as { importedCount: number };
}
