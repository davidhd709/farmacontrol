export interface AuthUser {
  id: string;
  username: string;
  isActive: boolean;
  roles?: string[];
  permissions?: string[];
  /** Contraseña temporal asignada por un administrador: hay que cambiarla antes de operar. */
  mustChangePassword?: boolean;
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
