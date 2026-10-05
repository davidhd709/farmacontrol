import type {
  ThirdPartyDto,
  CreateThirdPartyPayload,
  UpdateThirdPartyPayload,
  ThirdPartyQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchThirdParties(
  filters: ThirdPartyQueryFilters = {}
): Promise<PaginatedResponse<ThirdPartyDto>> {
  const query = new URLSearchParams();

  if (filters.search?.trim()) query.set('search', filters.search.trim());
  if (filters.role && filters.role !== 'ALL') query.set('role', filters.role);
  if (filters.isActive !== undefined) query.set('isActive', String(filters.isActive));
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));
  else if (filters.pageSize) query.set('limit', String(filters.pageSize));

  const qs = query.toString();
  return apiRequest<PaginatedResponse<ThirdPartyDto>>(
    qs ? `third-parties?${qs}` : 'third-parties',
    { method: 'GET' }
  );
}

export async function fetchThirdPartyById(id: string): Promise<ThirdPartyDto> {
  return apiRequest<ThirdPartyDto>(`third-parties/${id}`, {
    method: 'GET',
  });
}

export async function createThirdParty(
  payload: CreateThirdPartyPayload
): Promise<ThirdPartyDto> {
  return apiRequest<ThirdPartyDto>('third-parties', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateThirdParty(
  id: string,
  payload: UpdateThirdPartyPayload
): Promise<ThirdPartyDto> {
  return apiRequest<ThirdPartyDto>(`third-parties/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deactivateThirdParty(id: string): Promise<ThirdPartyDto> {
  return apiRequest<ThirdPartyDto>(`third-parties/${id}/deactivate`, {
    method: 'PATCH',
  });
}

export async function activateThirdParty(id: string): Promise<ThirdPartyDto> {
  return apiRequest<ThirdPartyDto>(`third-parties/${id}/activate`, {
    method: 'PATCH',
  });
}
