export const SESSION_TOKEN_PORT = Symbol('SESSION_TOKEN_PORT');

export interface GeneratedSessionToken {
  /**
   * Token en texto claro entregado exclusivamente al cliente (para cookie HttpOnly).
   * NUNCA se persiste en la base de datos.
   */
  rawToken: string;

  /**
   * Hash determinista SHA-256 del token que se almacena en PostgreSQL.
   */
  tokenHash: string;
}

/**
 * Puerto para la generación y hashing de tokens de sesión opacos.
 * Desacoplado de la implementación criptográfica subyacente.
 */
export interface SessionTokenPort {
  /**
   * Genera un nuevo token de sesión con 256 bits (32 bytes) de entropía CSPRNG.
   */
  generate(): GeneratedSessionToken;

  /**
   * Calcula el hash determinista SHA-256 de un token en texto claro recibido.
   */
  hash(rawToken: string): string;
}
