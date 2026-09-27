import { InvalidUsernameException } from '../exceptions/identity.exceptions';

/**
 * Value Object inmutable que encapsula el nombre de usuario (identificador de acceso).
 * Garantiza la invariante de normalización (.trim().toLowerCase()) y validación
 * de formato antes de cualquier persistencia o comparación.
 */
export class Username {
  private static readonly USERNAME_REGEX = /^[a-z0-9._-]+$/;
  private static readonly MIN_LENGTH = 3;
  private static readonly MAX_LENGTH = 50;

  private readonly _value: string;

  private constructor(rawUsername: string) {
    if (!rawUsername || typeof rawUsername !== 'string') {
      throw new InvalidUsernameException('El nombre de usuario no puede estar vacío.');
    }

    const normalized = rawUsername.trim().toLowerCase();

    if (normalized.length < Username.MIN_LENGTH) {
      throw new InvalidUsernameException(
        `El nombre de usuario debe tener al menos ${Username.MIN_LENGTH} caracteres.`
      );
    }

    if (normalized.length > Username.MAX_LENGTH) {
      throw new InvalidUsernameException(
        `El nombre de usuario no puede superar los ${Username.MAX_LENGTH} caracteres.`
      );
    }

    if (!Username.USERNAME_REGEX.test(normalized)) {
      throw new InvalidUsernameException(
        'El nombre de usuario solo puede contener letras minúsculas, números, puntos (.), guiones bajos (_) y guiones (-).'
      );
    }

    this._value = normalized;
  }

  /**
   * Crea y valida una instancia del Value Object Username.
   */
  public static create(rawUsername: string): Username {
    return new Username(rawUsername);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: Username): boolean {
    return this._value === other._value;
  }

  public toString(): string {
    return this._value;
  }
}
