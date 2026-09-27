import { ApiError, apiRequest } from '../../../api/http-client';
import type {
  AuthUser,
  CurrentUserResponse,
  LoginCredentials,
  LoginResponse,
  LogoutResponse,
} from '../auth.types';

export const authApi = {
  async getCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
    try {
      const response = await apiRequest<CurrentUserResponse>('auth/me', { signal });
      return response.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return null;
      }
      throw error;
    }
  },

  login(credentials: LoginCredentials): Promise<LoginResponse> {
    return apiRequest<LoginResponse>('auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  logout(): Promise<LogoutResponse> {
    return apiRequest<LogoutResponse>('auth/logout', {
      method: 'POST',
    });
  },
};
