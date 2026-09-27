import type {
  CreateSystemUserDto,
  SystemRoleItemDto,
  SystemUserListItemDto,
  UpdateSystemUserRolesDto,
  UpdateSystemUserStatusDto,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchUsers(): Promise<SystemUserListItemDto[]> {
  return apiRequest<SystemUserListItemDto[]>('users', { method: 'GET' });
}

export async function fetchRoles(): Promise<SystemRoleItemDto[]> {
  return apiRequest<SystemRoleItemDto[]>('users/roles', { method: 'GET' });
}

export async function createSystemUser(dto: CreateSystemUserDto): Promise<SystemUserListItemDto> {
  return apiRequest<SystemUserListItemDto>('users', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function updateSystemUserStatus(
  id: string,
  isActive: boolean
): Promise<SystemUserListItemDto> {
  const payload: UpdateSystemUserStatusDto = { isActive };
  return apiRequest<SystemUserListItemDto>(`users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function updateSystemUserRoles(
  id: string,
  roles: string[]
): Promise<SystemUserListItemDto> {
  const payload: UpdateSystemUserRolesDto = { roles };
  return apiRequest<SystemUserListItemDto>(`users/${id}/roles`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
