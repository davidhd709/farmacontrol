import { apiRequest } from '../../api/http-client';
import type { ChangeOwnPasswordDto, PasswordActionResponseDto } from '@farmacia/contracts';

export function changeOwnPassword(currentPassword: string, newPassword: string) {
  const payload: ChangeOwnPasswordDto = { currentPassword, newPassword };
  return apiRequest<PasswordActionResponseDto>('auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
