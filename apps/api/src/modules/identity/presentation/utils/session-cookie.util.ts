import { DEFAULT_SESSION_DURATION_MS } from '../../application/services/session.service';

/**
 * Nombre estándar de la cookie de sesión opaca según arquitectura (ADR-004 y PLAN_DESARROLLO).
 */
export const SESSION_COOKIE_NAME = 'sid';

export interface SessionCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge?: number;
}

/**
 * Obtiene la configuración segura para establecer la cookie de sesión en la respuesta HTTP.
 *
 * @param isProduction Indica si el entorno es producción (fuerza Secure: true).
 */
export function getSessionCookieOptions(
  isProduction = process.env.NODE_ENV === 'production'
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: DEFAULT_SESSION_DURATION_MS,
  };
}

/**
 * Obtiene las opciones para borrar/invalidar la cookie en el cliente al cerrar sesión.
 */
export function getClearSessionCookieOptions(
  isProduction = process.env.NODE_ENV === 'production'
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

/**
 * Extrae el valor del token de sesión a partir de la cabecera HTTP `Cookie`.
 * Parser seguro y ligero de cookies sin dependencias externas.
 *
 * @param cookieHeader Contenido crudo de `request.headers.cookie`.
 * @returns El token en texto claro o null si no se encuentra.
 */
export function extractTokenFromCookieHeader(
  cookieHeader?: string
): string | null {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key === SESSION_COOKIE_NAME) {
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      try {
        return decodeURIComponent(rawValue);
      } catch {
        // F-25: Tratar percent-encoding malformado como cookie inválida en lugar de lanzar URIError
        return null;
      }
    }
  }

  return null;
}
