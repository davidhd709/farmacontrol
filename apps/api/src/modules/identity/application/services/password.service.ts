import { Inject, Injectable } from '@nestjs/common';
import {
  PASSWORD_HASHER_PORT,
  PasswordHasherPort,
} from '../ports/password-hasher.port';
import { WeakPasswordException } from '../../domain/exceptions/identity.exceptions';

@Injectable()
export class PasswordService {
  public static readonly MIN_PASSWORD_LENGTH = 10;
  public static readonly MAX_PASSWORD_LENGTH = 128;

  constructor(
    @Inject(PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort
  ) {}

  /**
   * Valida la robustez de una contraseña según las políticas de seguridad del sistema.
   * Reglas:
   * - Mínimo 10 caracteres
   * - Máximo 128 caracteres (F-15: mitigación DoS)
   * - Al menos 1 letra minúscula
   * - Al menos 1 letra mayúscula
   * - Al menos 1 dígito numérico
   * - Al menos 1 carácter especial
   */
  public validatePasswordStrength(plainPassword: string): void {
    if (!plainPassword || typeof plainPassword !== 'string') {
      throw new WeakPasswordException('La contraseña no puede estar vacía.');
    }

    if (plainPassword.length < PasswordService.MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordException(
        `La contraseña debe tener al menos ${PasswordService.MIN_PASSWORD_LENGTH} caracteres.`
      );
    }

    if (plainPassword.length > PasswordService.MAX_PASSWORD_LENGTH) {
      throw new WeakPasswordException(
        `La contraseña no puede exceder los ${PasswordService.MAX_PASSWORD_LENGTH} caracteres.`
      );
    }

    if (!/[a-z]/.test(plainPassword)) {
      throw new WeakPasswordException(
        'La contraseña debe incluir al menos una letra minúscula.'
      );
    }

    if (!/[A-Z]/.test(plainPassword)) {
      throw new WeakPasswordException(
        'La contraseña debe incluir al menos una letra mayúscula.'
      );
    }

    if (!/[0-9]/.test(plainPassword)) {
      throw new WeakPasswordException(
        'La contraseña debe incluir al menos un número.'
      );
    }

    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(plainPassword)) {
      throw new WeakPasswordException(
        'La contraseña debe incluir al menos un carácter especial.'
      );
    }
  }

  /**
   * Valida y genera el hash seguro de una contraseña.
   */
  public async hashPassword(plainPassword: string): Promise<string> {
    this.validatePasswordStrength(plainPassword);
    return this.passwordHasher.hash(plainPassword);
  }

  /**
   * Compara una contraseña candidata en texto plano contra un hash almacenado.
   */
  public async verifyPassword(
    plainPassword: string,
    hash: string
  ): Promise<boolean> {
    if (!plainPassword || !hash) {
      return false;
    }
    return this.passwordHasher.verify(plainPassword, hash);
  }
}
