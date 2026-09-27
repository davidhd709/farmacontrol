import type {
  SupplierDto,
  CreateSupplierPayload,
  UpdateSupplierPayload,
  SupplierQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchSuppliers(
  filters: SupplierQueryFilters = {}
): Promise<PaginatedResponse<SupplierDto>> {
  const query = new URLSearchParams();

  if (filters.search?.trim()) query.set('search', filters.search.trim());
  if (filters.isActive !== undefined) query.set('isActive', String(filters.isActive));
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<SupplierDto>>(
    qs ? `suppliers?${qs}` : 'suppliers',
    { method: 'GET' }
  );
}

export async function fetchSupplierById(id: string): Promise<SupplierDto> {
  return apiRequest<SupplierDto>(`suppliers/${id}`, {
    method: 'GET',
  });
}

export async function createSupplier(
  payload: CreateSupplierPayload
): Promise<SupplierDto> {
  return apiRequest<SupplierDto>('suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSupplier(
  id: string,
  payload: UpdateSupplierPayload
): Promise<SupplierDto> {
  return apiRequest<SupplierDto>(`suppliers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deactivateSupplier(id: string): Promise<SupplierDto> {
  return apiRequest<SupplierDto>(`suppliers/${id}`, {
    method: 'DELETE',
  });
}
