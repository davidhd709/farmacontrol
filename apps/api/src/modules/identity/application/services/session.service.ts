import { Inject, Injectable } from '@nestjs/common';
import {
  SESSION_TOKEN_PORT,
  SessionTokenPort,
} from '../ports/session-token.port';
import {
  SESSION_REPOSITORY_PORT,
  SessionRepositoryPort,
} from '../ports/session.repository.port';
import { Session } from '../../domain/entities/session.entity';
import { InvalidSessionDurationException } from '../../domain/exceptions/identity.exceptions';

/**
 * Duración por defecto de una sesión: 24 horas en milisegundos.
 */
export const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Longitud esperada del token en texto claro (32 bytes en formato hex).
 */
export const RAW_TOKEN_LENGTH = 64;

/**
 * Expresión regular para validar formato hexadecimal estricto de 64 caracteres (F-19).
 */
export const RAW_TOKEN_REGEX = /^[0-9a-f]{64}$/i;

/**
 * Umbral de refresco (throttling) para actualizar lastUsedAt: 5 minutos (F-20).
 * Evita una escritura en PostgreSQL en cada lectura HTTP autenticada.
 */
export const SESSION_USAGE_THROTTLE_MS = 5 * 60 * 1000;

export interface CreatedSessionOutput {
  session: Session;
  rawToken: string;
}

/**
 * Servicio de aplicación para la gestión del ciclo de vida de sesiones opacas.
 * Coordina la generación segura de tokens, hashing determinista y persistencia.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(SESSION_TOKEN_PORT)
    private readonly tokenPort: SessionTokenPort,
    @Inject(SESSION_REPOSITORY_PORT)
    private readonly sessionRepository: SessionRepositoryPort
  ) {}

  /**
   * Crea una nueva sesión para un usuario.
   * Genera el token opaco con 256 bits de entropía y persiste únicamente su hash SHA-256.
   *
   * @param userId Identificador UUID del usuario.
   * @param durationMs Duración opcional de la sesión en ms (por defecto 24h).
   * @returns Objeto con la entidad de dominio `session` y el `rawToken` para entrega al cliente.
   */
  public async createSession(
    userId: string,
    durationMs: number = DEFAULT_SESSION_DURATION_MS
  ): Promise<CreatedSessionOutput> {
    // F-21: Validación estricta de duración de sesión (debe ser entero positivo finito)
    if (
      typeof durationMs !== 'number' ||
      !Number.isFinite(durationMs) ||
      !Number.isInteger(durationMs) ||
      durationMs <= 0
    ) {
      throw new InvalidSessionDurationException(
        'La duración de la sesión debe ser un número entero positivo finito de milisegundos.'
      );
    }

    const { rawToken, tokenHash } = this.tokenPort.generate();
    const expiresAt = new Date(Date.now() + durationMs);

    const domainSession = Session.create({
      userId,
      tokenHash,
      expiresAt,
    });

    const persistedSession = await this.sessionRepository.create(domainSession);

    return {
      session: persistedSession,
      rawToken,
    };
  }

  /**
   * Valida un token opaco recibido.
   * Valida tempranamente el formato hexadecimal de 64 caracteres (F-19) antes de calcular hash o consultar BD.
   * Si es válida y activa, actualiza su marca de último uso (lastUsedAt) respetando el umbral de 5 min (F-20).
   *
   * @param rawToken Token en texto plano recibido del cliente.
   * @param touchUsage Indica si debe evaluarse la actualización de lastUsedAt (por defecto true).
   * @param now Fecha de referencia para evaluación temporal (por defecto Date.now()).
   * @returns La entidad Session si es válida, o null si no existe, está expirada o revocada.
   */
  public async validateSession(
    rawToken: string,
    touchUsage = true,
    now: Date = new Date()
  ): Promise<Session | null> {
    // F-19: Validación temprana de longitud y formato hexadecimal estricto
    if (
      !rawToken ||
      typeof rawToken !== 'string' ||
      rawToken.length !== RAW_TOKEN_LENGTH ||
      !RAW_TOKEN_REGEX.test(rawToken)
    ) {
      return null;
    }

    try {
      const tokenHash = this.tokenPort.hash(rawToken);
      const session = await this.sessionRepository.findByTokenHash(tokenHash);

      if (!session || !session.isValid(now)) {
        return null;
      }

      if (touchUsage) {
        // F-20: Throttling de 5 minutos para actualización de lastUsedAt
        const lastUsed = session.lastUsedAt;
        const shouldUpdate =
          !lastUsed ||
          now.getTime() - lastUsed.getTime() >= SESSION_USAGE_THROTTLE_MS;

        if (shouldUpdate) {
          session.recordUsage(now);
          const updated = await this.sessionRepository.update(session);
          return updated.isValid(now) ? updated : null;
        }
      }

      return session;
    } catch {
      return null;
    }
  }

  /**
   * Revoca una sesión activa identificada por su token en texto claro (Logout).
   * Valida el formato del token antes de buscarlo.
   *
   * @param rawToken Token en texto plano recibido del cliente.
   * @returns true si la sesión existía y fue revocada; false en caso contrario.
   */
  public async revokeSession(rawToken: string): Promise<boolean> {
    if (
      !rawToken ||
      typeof rawToken !== 'string' ||
      rawToken.length !== RAW_TOKEN_LENGTH ||
      !RAW_TOKEN_REGEX.test(rawToken)
    ) {
      return false;
    }

    try {
      const tokenHash = this.tokenPort.hash(rawToken);
      const session = await this.sessionRepository.findByTokenHash(tokenHash);

      if (!session) {
        return false;
      }

      session.revoke();
      await this.sessionRepository.update(session);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Revoca una sesión por su identificador primario.
   */
  public async revokeSessionById(sessionId: string): Promise<boolean> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      return false;
    }

    session.revoke();
    await this.sessionRepository.update(session);
    return true;
  }

  /**
   * Invalida todas las sesiones asociadas a un usuario específico.
   */
  public async revokeAllUserSessions(userId: string): Promise<number> {
    return this.sessionRepository.deleteByUserId(userId);
  }
}
