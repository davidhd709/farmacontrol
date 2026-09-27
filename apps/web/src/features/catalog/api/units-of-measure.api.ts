import type {
  UnitOfMeasureDto,
  UnitOfMeasureQueryFilters,
  CreateUnitOfMeasurePayload,
  UpdateUnitOfMeasurePayload,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchUnitsOfMeasure(
  filters: UnitOfMeasureQueryFilters = {},
): Promise<PaginatedResponse<UnitOfMeasureDto>> {
  const query = new URLSearchParams();

  if (filters.search?.trim()) {
    query.set('search', filters.search.trim());
  }

  if (filters.category?.trim()) {
    query.set('category', filters.category.trim());
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
  const endpoint = queryString ? `units-of-measure?${queryString}` : 'units-of-measure';

  return apiRequest<PaginatedResponse<UnitOfMeasureDto>>(endpoint, {
    method: 'GET',
  });
}

export async function fetchUnitOfMeasureById(id: string): Promise<UnitOfMeasureDto> {
  return apiRequest<UnitOfMeasureDto>(`units-of-measure/${id}`, {
    method: 'GET',
  });
}

export async function createUnitOfMeasure(
  payload: CreateUnitOfMeasurePayload,
): Promise<UnitOfMeasureDto> {
  return apiRequest<UnitOfMeasureDto>('units-of-measure', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUnitOfMeasure(
  id: string,
  payload: UpdateUnitOfMeasurePayload,
): Promise<UnitOfMeasureDto> {
  return apiRequest<UnitOfMeasureDto>(`units-of-measure/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deactivateUnitOfMeasure(id: string): Promise<UnitOfMeasureDto> {
  return apiRequest<UnitOfMeasureDto>(`units-of-measure/${id}`, {
    method: 'DELETE',
  });
}
