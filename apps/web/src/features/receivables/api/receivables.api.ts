import type {
  ReceivableDto,
  ReceivableQueryFilters,
  PaginatedResponse,
  AgingBreakdownDto,
  ReversePaymentPayload,
  ReceivableMovementsDto,
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

export async function fetchReceivableMovements(id: string): Promise<ReceivableMovementsDto> {
  return apiRequestData<ReceivableMovementsDto>(`receivables/${id}/movements`, { method: 'GET' });
}

export async function fetchReceivablesAgingSummary(): Promise<AgingBreakdownDto> {
  return apiRequestData<AgingBreakdownDto>('receivables/aging-summary', { method: 'GET' });
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
