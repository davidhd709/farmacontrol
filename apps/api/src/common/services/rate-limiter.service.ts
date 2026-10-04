import { Injectable, OnModuleDestroy } from '@nestjs/common';

export interface RateLimitStatus {
  blocked: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface RateLimitEntry {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
}

/**
 * Servicio in-memory de limitación de tasa (Rate Limiting) y mitigación de fuerza bruta.
 * Implementa una ventana deslizante con protección por IP y por identificador de cuenta,
 * incluyendo limpieza periódica automática para prevenir fugas de memoria.
 */
@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly entries = new Map<string, RateLimitEntry>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    // Limpieza periódica de registros vencidos cada 60 segundos
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    // unref() para que no impida la terminación limpia de procesos CLI o tests
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  public onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * Verifica si una clave (IP o usuario) se encuentra actualmente bloqueada.
   */
  public checkLimit(key: string): RateLimitStatus {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry) {
      return { blocked: false, remaining: 1, retryAfterSeconds: 0 };
    }

    if (entry.blockedUntil && now < entry.blockedUntil) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000));
      return { blocked: true, remaining: 0, retryAfterSeconds };
    }

    return { blocked: false, remaining: 1, retryAfterSeconds: 0 };
  }

  /**
   * Registra un intento para una clave determinada.
   * Si se supera `maxAttempts` dentro de la ventana `windowMs`, se bloquea por `blockDurationMs` (o `windowMs`).
   *
   * @param key Identificador (ej. `ip:127.0.0.1` o `user:admin`)
   * @param maxAttempts Máximo de intentos permitidos antes de bloquear
   * @param windowMs Ventana temporal en milisegundos
   * @param blockDurationMs Duración del bloqueo en milisegundos (por defecto igual a windowMs)
   */
  public recordAttempt(
    key: string,
    maxAttempts: number,
    windowMs: number,
    blockDurationMs = windowMs
  ): RateLimitStatus {
    const now = Date.now();
    const entry = this.entries.get(key);

    // Si ya estaba bloqueado y el bloqueo sigue activo
    if (entry?.blockedUntil && now < entry.blockedUntil) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000));
      return { blocked: true, remaining: 0, retryAfterSeconds };
    }

    // Si no existía o la ventana anterior ya expiró
    if (!entry || now > entry.firstAttemptAt + windowMs) {
      this.entries.set(key, {
        count: 1,
        firstAttemptAt: now,
      });

      const remaining = Math.max(0, maxAttempts - 1);
      return { blocked: maxAttempts <= 1, remaining, retryAfterSeconds: 0 };
    }

    // Incrementar intentos dentro de la ventana activa
    entry.count += 1;

    if (entry.count >= maxAttempts) {
      entry.blockedUntil = now + blockDurationMs;
      const retryAfterSeconds = Math.max(1, Math.ceil(blockDurationMs / 1000));
      return { blocked: true, remaining: 0, retryAfterSeconds };
    }

    return {
      blocked: false,
      remaining: Math.max(0, maxAttempts - entry.count),
      retryAfterSeconds: 0,
    };
  }

  /**
   * Restablece el contador para una clave tras una operación exitosa (ej. login válido).
   */
  public reset(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Limpia entradas cuya ventana o bloqueo ya expiraron.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (entry.blockedUntil) {
        if (now >= entry.blockedUntil) {
          this.entries.delete(key);
        }
      } else if (now - entry.firstAttemptAt > 3_600_000) {
        // Expirar registros pasivos de más de 1 hora
        this.entries.delete(key);
      }
    }
  }

  /**
   * Limpia todo el almacenamiento (útil para suites de prueba).
   */
  public clearAll(): void {
    this.entries.clear();
  }
}
