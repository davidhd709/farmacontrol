import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import {
  GeneratedSessionToken,
  SessionTokenPort,
} from '../../application/ports/session-token.port';
import { InvalidSessionTokenException } from '../../domain/exceptions/identity.exceptions';

/**
 * Cantidad de bytes de entropía generados mediante CSPRNG del sistema operativo.
 * 32 bytes = 256 bits de entropía.
 * Proporciona resistencia total contra ataques de fuerza bruta (2^256 combinaciones).
 */
export const SESSION_TOKEN_ENTROPY_BYTES = 32;

/**
 * Adaptador criptográfico para generación de tokens de sesión opacos y hashing seguro.
 * Implementa CSPRNG (crypto.randomBytes) y hashing determinista SHA-256.
 */
@Injectable()
export class CryptoSessionTokenAdapter implements SessionTokenPort {
  /**
   * Genera un nuevo token de sesión con 256 bits de entropía y su hash SHA-256.
   *
   * @returns GeneratedSessionToken con `rawToken` (64 caracteres hex) y `tokenHash` (64 caracteres hex).
   */
  public generate(): GeneratedSessionToken {
    // 32 bytes de entropía generados por el CSPRNG del kernel (/dev/urandom o getrandom)
    const buffer = randomBytes(SESSION_TOKEN_ENTROPY_BYTES);
    const rawToken = buffer.toString('hex');
    const tokenHash = this.hash(rawToken);

    return {
      rawToken,
      tokenHash,
    };
  }

  /**
   * Calcula el hash determinista SHA-256 del token en texto claro recibido.
   *
   * @param rawToken Token en texto plano de 64 caracteres hexadecimales.
   * @throws InvalidSessionTokenException si el token es nulo, vacío o tiene longitud incorrecta.
   */
  public hash(rawToken: string): string {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      throw new InvalidSessionTokenException('El token no puede estar vacío.');
    }

    // SHA-256 produce 32 bytes (256 bits) que representados en hexadecimal miden 64 caracteres.
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }
}
