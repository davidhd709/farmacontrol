import type {
  BankAccountDto,
  BankAccountOptionDto,
  BankAccountsSummaryDto,
  BankMovementDirection,
  BankMovementDto,
  CreateCashReceiptPayload,
  CreateDisbursementPayload,
  CreateBankAccountDto,
  SortOrder,
  PaginatedResponse,
  TreasuryDocumentDto,
  TreasuryDocumentFilters,
  UpdateBankAccountDto,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export interface MovementFilterParams {
  fromDate?: string;
  toDate?: string;
  movementType?: string;
  direction?: BankMovementDirection;
  sortOrder?: SortOrder;
  search?: string;
  page?: number;
  limit?: number;
}

export async function getBankAccounts(includeInactive = false): Promise<BankAccountDto[]> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return apiRequest<BankAccountDto[]>(`treasury/bank-accounts${query}`);
}

export async function getBankAccountOptions(): Promise<BankAccountOptionDto[]> {
  return apiRequest<BankAccountOptionDto[]>('treasury/bank-accounts/options');
}

export async function getBankAccountSummary(): Promise<BankAccountsSummaryDto> {
  return apiRequest<BankAccountsSummaryDto>('treasury/bank-accounts/summary');
}

export async function getBankAccount(id: string): Promise<BankAccountDto> {
  return apiRequest<BankAccountDto>(`treasury/bank-accounts/${encodeURIComponent(id)}`);
}

export async function createBankAccount(data: CreateBankAccountDto): Promise<BankAccountDto> {
  return apiRequest<BankAccountDto>('treasury/bank-accounts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBankAccount(
  id: string,
  data: UpdateBankAccountDto,
): Promise<BankAccountDto> {
  return apiRequest<BankAccountDto>(`treasury/bank-accounts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getBankMovements(
  accountId: string,
  params: MovementFilterParams = {},
): Promise<{ items: BankMovementDto[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params.fromDate) searchParams.append('fromDate', params.fromDate);
  if (params.toDate) searchParams.append('toDate', params.toDate);
  if (params.movementType) searchParams.append('movementType', params.movementType);
  if (params.direction) searchParams.append('direction', params.direction);
  if (params.sortOrder) searchParams.append('sortOrder', params.sortOrder);
  if (params.search) searchParams.append('search', params.search);
  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());

  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return apiRequest<{ items: BankMovementDto[]; total: number }>(
    `treasury/bank-accounts/${encodeURIComponent(accountId)}/movements${qs}`,
  );
}

// ===== RECIBOS DE CAJA Y COMPROBANTES DE EGRESO =====

export async function getTreasuryDocuments(
  params: TreasuryDocumentFilters,
): Promise<PaginatedResponse<TreasuryDocumentDto>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return apiRequest<PaginatedResponse<TreasuryDocumentDto>>(
    `treasury/documents?${query.toString()}`,
  );
}

export async function getTreasuryDocument(id: string): Promise<TreasuryDocumentDto> {
  return apiRequest<TreasuryDocumentDto>(`treasury/documents/${encodeURIComponent(id)}`);
}

export async function createCashReceipt(
  payload: CreateCashReceiptPayload,
  idempotencyKey: string,
): Promise<TreasuryDocumentDto> {
  return apiRequest<TreasuryDocumentDto>('treasury/cash-receipts', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });
}

export async function createDisbursement(
  payload: CreateDisbursementPayload,
  idempotencyKey: string,
): Promise<TreasuryDocumentDto> {
  return apiRequest<TreasuryDocumentDto>('treasury/disbursements', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });
}
