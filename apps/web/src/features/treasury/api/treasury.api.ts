import type {
  BankAccountDto,
  BankAccountsSummaryDto,
  BankMovementDto,
  CreateBankAccountDto,
  CreateBankMovementDto,
  UpdateBankAccountDto,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export interface MovementFilterParams {
  fromDate?: string;
  toDate?: string;
  movementType?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function getBankAccounts(includeInactive = false): Promise<BankAccountDto[]> {
  const query = includeInactive ? '?includeInactive=true' : '';
  return apiRequest<BankAccountDto[]>(`treasury/bank-accounts${query}`);
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
  if (params.search) searchParams.append('search', params.search);
  if (params.page) searchParams.append('page', params.page.toString());
  if (params.limit) searchParams.append('limit', params.limit.toString());

  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return apiRequest<{ items: BankMovementDto[]; total: number }>(
    `treasury/bank-accounts/${encodeURIComponent(accountId)}/movements${qs}`,
  );
}

export async function createBankMovement(
  accountId: string,
  data: CreateBankMovementDto,
): Promise<BankMovementDto> {
  return apiRequest<BankMovementDto>(
    `treasury/bank-accounts/${encodeURIComponent(accountId)}/movements`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}
