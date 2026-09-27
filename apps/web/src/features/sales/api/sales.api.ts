import type {
  SaleDto,
  ConfirmSalePayload,
  SaleQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function confirmSale(
  payload: ConfirmSalePayload,
  idempotencyKey?: string
): Promise<SaleDto> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['idempotency-key'] = idempotencyKey;
  }

  return apiRequest<SaleDto>('sales/confirm', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

export async function fetchSales(
  filters: SaleQueryFilters = {}
): Promise<PaginatedResponse<SaleDto>> {
  const query = new URLSearchParams();

  if (filters.invoiceNumber?.trim()) query.set('invoiceNumber', filters.invoiceNumber.trim());
  if (filters.customerId) query.set('customerId', filters.customerId);
  if (filters.status) query.set('status', filters.status);
  if (filters.fromDate) query.set('fromDate', filters.fromDate);
  if (filters.toDate) query.set('toDate', filters.toDate);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<SaleDto>>(
    qs ? `sales?${qs}` : 'sales',
    { method: 'GET' }
  );
}

export async function fetchSaleById(id: string): Promise<SaleDto> {
  return apiRequest<SaleDto>(`sales/${id}`, {
    method: 'GET',
  });
}

export async function cancelSale(id: string, reason: string): Promise<SaleDto> {
  return apiRequest<SaleDto>(`sales/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
