import type {
  AlertsQueryFilters,
  AlertsSummaryDto,
  EvaluationResultDto,
  InventoryAlertDto,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchExpirations(
  filters: AlertsQueryFilters = {},
): Promise<PaginatedResponse<InventoryAlertDto>> {
  const query = new URLSearchParams();
  if (filters.severity) query.set('severity', filters.severity);
  if (filters.search) query.set('search', filters.search);
  if (filters.locationId) query.set('locationId', filters.locationId);
  if (filters.isResolved !== undefined) query.set('isResolved', String(filters.isResolved));
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<InventoryAlertDto>>(
    qs ? `alerts/expirations?${qs}` : 'alerts/expirations',
    { method: 'GET' },
  );
}

export async function fetchAlertsSummary(): Promise<AlertsSummaryDto> {
  return apiRequest<AlertsSummaryDto>('alerts/summary', { method: 'GET' });
}

export async function triggerAlertsEvaluation(
  referenceDate?: string,
): Promise<EvaluationResultDto> {
  return apiRequest<EvaluationResultDto>('alerts/evaluate', {
    method: 'POST',
    body: JSON.stringify(referenceDate ? { referenceDate } : {}),
  });
}
