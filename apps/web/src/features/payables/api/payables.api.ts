import type {
  PayableDto,
  PayableQueryFilters,
  RegisterPayablePaymentPayload,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchPayables(
  filters: PayableQueryFilters = {},
): Promise<PaginatedResponse<PayableDto>> {
  const query = new URLSearchParams();
  if (filters.supplierId) query.set('supplierId', filters.supplierId);
  if (filters.status) query.set('status', filters.status);
  if (filters.fromDate) query.set('fromDate', filters.fromDate);
  if (filters.toDate) query.set('toDate', filters.toDate);
  if (filters.overdueOnly) query.set('overdueOnly', 'true');
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<PayableDto>>(
    qs ? `payables?${qs}` : 'payables',
    { method: 'GET' },
  );
}

export async function fetchPayableById(id: string): Promise<PayableDto> {
  return apiRequest<PayableDto>(`payables/${id}`, { method: 'GET' });
}

export async function registerPayablePayment(
  id: string,
  payload: RegisterPayablePaymentPayload,
): Promise<PayableDto> {
  return apiRequest<PayableDto>(`payables/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
