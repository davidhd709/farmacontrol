import type {
  PurchaseDto,
  ReceivePurchasePayload,
  PurchaseQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchPurchases(
  filters: PurchaseQueryFilters = {}
): Promise<PaginatedResponse<PurchaseDto>> {
  const query = new URLSearchParams();

  if (filters.supplierId) query.set('supplierId', filters.supplierId);
  if (filters.invoiceNumber?.trim()) query.set('invoiceNumber', filters.invoiceNumber.trim());
  if (filters.status) query.set('status', filters.status);
  if (filters.fromDate) query.set('fromDate', filters.fromDate);
  if (filters.toDate) query.set('toDate', filters.toDate);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<PurchaseDto>>(
    qs ? `purchases?${qs}` : 'purchases',
    { method: 'GET' }
  );
}

export async function fetchPurchaseById(id: string): Promise<PurchaseDto> {
  return apiRequest<PurchaseDto>(`purchases/${id}`, {
    method: 'GET',
  });
}

export async function receivePurchase(
  payload: ReceivePurchasePayload
): Promise<PurchaseDto> {
  return apiRequest<PurchaseDto>('purchases/receive', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
