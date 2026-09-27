/**
 * Representación pública y segura de un usuario autenticado.
 * Excluye explícitamente passwordHash, tokenHash, rawToken y detalles internos.
 */
export interface AuthUserResponseDto {
  id: string;
  username: string;
  isActive: boolean;
  roles: string[];
  permissions: string[];
}

export interface LoginResponseDto {
  user: AuthUserResponseDto;
  message: string;
}

export interface CurrentUserResponseDto {
  user: AuthUserResponseDto;
}

export interface LogoutResponseDto {
  message: string;
}
