import type {
  CashMovementDto,
  CashBalanceDto,
  CreateCashMovementPayload,
  CashMovementQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchCashBalance(): Promise<CashBalanceDto> {
  return apiRequest<CashBalanceDto>('cash-movements/balance', {
    method: 'GET',
  });
}

export async function fetchCashMovements(
  filters: CashMovementQueryFilters = {}
): Promise<PaginatedResponse<CashMovementDto>> {
  const query = new URLSearchParams();

  if (filters.movementType) query.set('movementType', filters.movementType);
  if (filters.paymentMethod) query.set('paymentMethod', filters.paymentMethod);
  if (filters.startDate) query.set('startDate', filters.startDate);
  if (filters.endDate) query.set('endDate', filters.endDate);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<CashMovementDto>>(
    qs ? `cash-movements?${qs}` : 'cash-movements',
    { method: 'GET' }
  );
}

export async function fetchCashMovementById(id: string): Promise<CashMovementDto> {
  return apiRequest<CashMovementDto>(`cash-movements/${id}`, {
    method: 'GET',
  });
}

export async function createCashMovement(
  payload: CreateCashMovementPayload
): Promise<CashMovementDto> {
  return apiRequest<CashMovementDto>('cash-movements', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
