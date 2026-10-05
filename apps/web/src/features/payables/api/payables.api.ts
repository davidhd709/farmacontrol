import type {
  PayableDto,
  PayableQueryFilters,
  RegisterPayablePaymentPayload,
  PaginatedResponse,
  AgingSummaryDto,
  ReversePaymentPayload,
} from '@farmacia/contracts';
import { apiRequestData } from '../../../api/http-client';

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
  return apiRequestData<PaginatedResponse<PayableDto>>(qs ? `payables?${qs}` : 'payables', {
    method: 'GET',
  });
}

export async function fetchPayableById(id: string): Promise<PayableDto> {
  return apiRequestData<PayableDto>(`payables/${id}`, { method: 'GET' });
}

export async function fetchPayablesAgingSummary(): Promise<AgingSummaryDto> {
  return apiRequestData<AgingSummaryDto>('payables/aging-summary', { method: 'GET' });
}

export async function registerPayablePayment(
  id: string,
  payload: RegisterPayablePaymentPayload,
  idempotencyKey: string,
): Promise<PayableDto> {
  return apiRequestData<PayableDto>(`payables/${id}/payments`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });
}

export async function revertPayablePayment(
  payableId: string,
  paymentId: string,
  payload: ReversePaymentPayload,
): Promise<PayableDto> {
  return apiRequestData<PayableDto>(`payables/${payableId}/payments/${paymentId}/reverse`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
