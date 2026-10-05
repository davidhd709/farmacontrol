import type {
  ReceivableDto,
  ReceivableQueryFilters,
  RegisterReceivablePaymentPayload,
  PaginatedResponse,
  AgingSummaryDto,
  ReversePaymentPayload,
} from '@farmacia/contracts';
import { apiRequestData } from '../../../api/http-client';

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
  return apiRequestData<PaginatedResponse<ReceivableDto>>(
    qs ? `receivables?${qs}` : 'receivables',
    { method: 'GET' },
  );
}

export async function fetchReceivableById(id: string): Promise<ReceivableDto> {
  return apiRequestData<ReceivableDto>(`receivables/${id}`, { method: 'GET' });
}

export async function fetchReceivablesAgingSummary(): Promise<AgingSummaryDto> {
  return apiRequestData<AgingSummaryDto>('receivables/aging-summary', { method: 'GET' });
}

export async function registerReceivablePayment(
  id: string,
  payload: RegisterReceivablePaymentPayload,
  idempotencyKey: string,
): Promise<ReceivableDto> {
  return apiRequestData<ReceivableDto>(`receivables/${id}/payments`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });
}

export async function revertReceivablePayment(
  receivableId: string,
  paymentId: string,
  payload: ReversePaymentPayload,
): Promise<ReceivableDto> {
  return apiRequestData<ReceivableDto>(
    `receivables/${receivableId}/payments/${paymentId}/reverse`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}
