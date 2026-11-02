import type {
  PayableDto,
  ReversePaymentPayload,
  PayableMovementsDto,
  PayableStatementDto,
  PayableStatementFilters,
} from '@farmacia/contracts';
import { apiRequestData } from '../../../api/http-client';

export async function fetchPayableStatement(
  filters: PayableStatementFilters,
): Promise<PayableStatementDto> {
  const query = new URLSearchParams();
  if (filters.supplierId) query.set('supplierId', filters.supplierId);
  if (filters.fromDate) query.set('fromDate', filters.fromDate);
  if (filters.toDate) query.set('toDate', filters.toDate);
  if (filters.includePaid) query.set('includePaid', 'true');
  return apiRequestData<PayableStatementDto>(`payables/statement?${query.toString()}`, {
    method: 'GET',
  });
}

export async function fetchPayableMovements(id: string): Promise<PayableMovementsDto> {
  return apiRequestData<PayableMovementsDto>(`payables/${id}/movements`, { method: 'GET' });
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
