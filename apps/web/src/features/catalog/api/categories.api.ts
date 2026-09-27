import type {
  CategoryDto,
  CategoryQueryFilters,
  CreateCategoryPayload,
  PaginatedResponse,
  UpdateCategoryPayload,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchCategories(
  filters: CategoryQueryFilters = {},
): Promise<PaginatedResponse<CategoryDto>> {
  const query = new URLSearchParams();

  if (filters.search?.trim()) {
    query.set('search', filters.search.trim());
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
  const endpoint = queryString ? `categories?${queryString}` : 'categories';

  return apiRequest<PaginatedResponse<CategoryDto>>(endpoint, {
    method: 'GET',
  });
}

export async function fetchCategoryById(id: string): Promise<CategoryDto> {
  return apiRequest<CategoryDto>(`categories/${id}`, {
    method: 'GET',
  });
}

export async function createCategory(payload: CreateCategoryPayload): Promise<CategoryDto> {
  return apiRequest<CategoryDto>('categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCategory(
  id: string,
  payload: UpdateCategoryPayload,
): Promise<CategoryDto> {
  return apiRequest<CategoryDto>(`categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deactivateCategory(id: string): Promise<CategoryDto> {
  return apiRequest<CategoryDto>(`categories/${id}`, {
    method: 'DELETE',
  });
}
