export const PASSWORD_HASHER_PORT = Symbol('PASSWORD_HASHER_PORT');

/**
 * Puerto de abstracción para servicios criptográficos de hashing y verificación de contraseñas.
 * Permite desacoplar los casos de uso de la librería específica (Argon2, bcrypt, etc.).
 */
export interface PasswordHasherPort {
  /**
   * Genera un hash criptográfico seguro a partir de una contraseña en texto plano.
   */
  hash(plainPassword: string): Promise<string>;

  /**
   * Verifica si una contraseña en texto plano coincide con un hash almacenado.
   */
  verify(plainPassword: string, hash: string): Promise<boolean>;
}
