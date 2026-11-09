import type {
  SaleDto,
  FefoPreviewPayload,
  FefoPreviewDto,
  ConfirmSalePayload,
  SaleQueryFilters,
  PaginatedResponse,
  CreditNoteDto,
  SaleActionHistoryDto,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function confirmSale(
  payload: ConfirmSalePayload,
  idempotencyKey?: string,
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
  filters: SaleQueryFilters = {},
): Promise<PaginatedResponse<SaleDto>> {
  const query = new URLSearchParams();

  if (filters.search?.trim()) query.set('search', filters.search.trim());
  if (filters.invoiceNumber?.trim()) query.set('invoiceNumber', filters.invoiceNumber.trim());
  if (filters.customerId) query.set('customerId', filters.customerId);
  if (filters.status) query.set('status', filters.status);
  if (filters.fromDate) query.set('fromDate', filters.fromDate);
  if (filters.toDate) query.set('toDate', filters.toDate);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<SaleDto>>(qs ? `sales?${qs}` : 'sales', { method: 'GET' });
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

export function fetchFefoPreview(
  payload: FefoPreviewPayload,
  signal?: AbortSignal,
): Promise<FefoPreviewDto> {
  return apiRequest<FefoPreviewDto>('sales/fefo-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  });
}

export async function fetchSaleCreditNotes(saleId: string): Promise<CreditNoteDto[]> {
  return apiRequest<CreditNoteDto[]>(`sales/${encodeURIComponent(saleId)}/credit-notes`);
}

/** Lista todas las notas crédito registradas en el sistema (REQ-005). */
export async function fetchCreditNotes(saleId?: string): Promise<CreditNoteDto[]> {
  const qs = saleId ? `?saleId=${encodeURIComponent(saleId)}` : '';
  return apiRequest<CreditNoteDto[]>(`credit-notes${qs}`, { method: 'GET' });
}

/** Anula la devolución: la mercancía vuelve a salir, el reembolso se deshace y se reversa el asiento. */
export async function cancelCreditNote(id: string, reason: string): Promise<CreditNoteDto> {
  return apiRequest<CreditNoteDto>(`credit-notes/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/** Consulta la trazabilidad cronológica completa de eventos de una factura (REQ-006). */
export async function fetchSaleActionHistory(saleId: string): Promise<SaleActionHistoryDto> {
  return apiRequest<SaleActionHistoryDto>(`sales/${encodeURIComponent(saleId)}/history`, {
    method: 'GET',
  });
}
