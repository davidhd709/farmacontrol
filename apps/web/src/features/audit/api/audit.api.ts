import { apiRequest } from '../../../api/http-client';
import {
  AuditEventDto,
  AuditMetadataDto,
  AuditQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';

export const fetchAuditEvents = (filters: AuditQueryFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', String(filters.page));
  if (filters.pageSize) params.append('pageSize', String(filters.pageSize));
  if (filters.userId) params.append('userId', filters.userId);
  if (filters.action) params.append('action', filters.action);
  if (filters.entity) params.append('entity', filters.entity);
  if (filters.entityId) params.append('entityId', filters.entityId);
  if (filters.correlationId) params.append('correlationId', filters.correlationId);
  if (filters.fromDate) params.append('fromDate', filters.fromDate);
  if (filters.toDate) params.append('toDate', filters.toDate);
  if (filters.search) params.append('search', filters.search);

  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<PaginatedResponse<AuditEventDto>>(`audit/events${query}`);
};

export const fetchAuditMetadata = () => {
  return apiRequest<AuditMetadataDto>('audit/metadata');
};

export const fetchAuditEventById = (id: string) => {
  return apiRequest<AuditEventDto>(`audit/events/${encodeURIComponent(id)}`);
};
