export interface AuthUser {
  id: string;
  username: string;
  isActive: boolean;
  roles?: string[];
  permissions?: string[];
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  message: string;
}

export interface CurrentUserResponse {
  user: AuthUser;
}

export interface LogoutResponse {
  message: string;
}
