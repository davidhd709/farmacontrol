import type {
  CustomerDto,
  CreateCustomerPayload,
  UpdateCustomerPayload,
  CustomerQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchCustomers(
  filters: CustomerQueryFilters = {}
): Promise<PaginatedResponse<CustomerDto>> {
  const query = new URLSearchParams();

  if (filters.search?.trim()) query.set('search', filters.search.trim());
  if (filters.isActive !== undefined) query.set('isActive', String(filters.isActive));
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<CustomerDto>>(
    qs ? `customers?${qs}` : 'customers',
    { method: 'GET' }
  );
}

export async function fetchDefaultCustomer(): Promise<CustomerDto> {
  return apiRequest<CustomerDto>('customers/default', {
    method: 'GET',
  });
}

export async function fetchCustomerById(id: string): Promise<CustomerDto> {
  return apiRequest<CustomerDto>(`customers/${id}`, {
    method: 'GET',
  });
}

export async function createCustomer(
  payload: CreateCustomerPayload
): Promise<CustomerDto> {
  return apiRequest<CustomerDto>('customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCustomer(
  id: string,
  payload: UpdateCustomerPayload
): Promise<CustomerDto> {
  return apiRequest<CustomerDto>(`customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deactivateCustomer(id: string): Promise<CustomerDto> {
  return apiRequest<CustomerDto>(`customers/${id}`, {
    method: 'DELETE',
  });
}
