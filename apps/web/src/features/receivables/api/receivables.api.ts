import type {
  ReceivableDto,
  ReceivableQueryFilters,
  RegisterReceivablePaymentPayload,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchReceivables(
  filters: ReceivableQueryFilters = {},
): Promise<PaginatedResponse<ReceivableDto>> {
  const query = new URLSearchParams();
  if (filters.customerId) query.set('customerId', filters.customerId);
  if (filters.status) query.set('status', filters.status);
  if (filters.fromDate) query.set('fromDate', filters.fromDate);
  if (filters.toDate) query.set('toDate', filters.toDate);
  if (filters.overdueOnly) query.set('overdueOnly', 'true');
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<ReceivableDto>>(
    qs ? `receivables?${qs}` : 'receivables',
    { method: 'GET' },
  );
}

export async function fetchReceivableById(id: string): Promise<ReceivableDto> {
  return apiRequest<ReceivableDto>(`receivables/${id}`, { method: 'GET' });
}

export async function registerReceivablePayment(
  id: string,
  payload: RegisterReceivablePaymentPayload,
): Promise<ReceivableDto> {
  return apiRequest<ReceivableDto>(`receivables/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
