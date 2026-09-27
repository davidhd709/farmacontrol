import { Injectable, Optional } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHasherPort } from '../../application/ports/password-hasher.port';

export interface Argon2Options {
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
  hashLength?: number;
}

/**
 * Adaptador de infraestructura para hashing de contraseñas con Argon2id.
 * Aplica los parámetros recomendados por OWASP para entornos de producción,
 * permitiendo parametrización en pruebas para optimizar la velocidad de ejecución.
 */
@Injectable()
export class Argon2PasswordHasherAdapter implements PasswordHasherPort {
  private readonly defaultOptions: argon2.HashOptions;

  constructor(@Optional() options?: Argon2Options) {
    this.defaultOptions = {
      type: argon2.argon2id,
      memoryCost: options?.memoryCost ?? 65536, // 64 MiB
      timeCost: options?.timeCost ?? 3, // 3 iteraciones
      parallelism: options?.parallelism ?? 4, // 4 hilos
      hashLength: options?.hashLength ?? 32, // 32 bytes
    };
  }

  public async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, this.defaultOptions);
  }

  public async verify(plainPassword: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch {
      return false;
    }
  }
}
