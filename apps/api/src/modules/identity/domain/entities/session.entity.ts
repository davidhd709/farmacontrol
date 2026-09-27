import {
  InvalidSessionTokenException,
  SessionExpiredException,
  SessionRevokedException,
} from '../exceptions/identity.exceptions';

export interface CreateSessionProps {
  id?: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
}

export interface ReconstituteSessionProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

/**
 * Entidad de dominio pura de Sesión Opaca.
 * Desacoplada de Prisma, HTTP y frameworks.
 *
 * Invariante: Nunca almacena el token en texto claro (rawToken),
 * únicamente su representación hash determinista (tokenHash SHA-256).
 */
export class Session {
  private readonly _id?: string;
  private readonly _userId: string;
  private readonly _tokenHash: string;
  private readonly _expiresAt: Date;
  private readonly _createdAt?: Date;
  private _lastUsedAt?: Date;
  private _revokedAt?: Date;

  private constructor(
    id: string | undefined,
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    createdAt?: Date,
    lastUsedAt?: Date,
    revokedAt?: Date
  ) {
    this._id = id;
    this._userId = userId;
    this._tokenHash = tokenHash;
    this._expiresAt = expiresAt;
    this._createdAt = createdAt;
    this._lastUsedAt = lastUsedAt;
    this._revokedAt = revokedAt;
  }

  /**
   * Crea una nueva sesión de dominio validando invariantes iniciales.
   */
  public static create(props: CreateSessionProps): Session {
    if (!props.userId || props.userId.trim().length === 0) {
      throw new Error('El identificador de usuario (userId) es obligatorio.');
    }

    if (!props.tokenHash || !SHA256_HEX_REGEX.test(props.tokenHash)) {
      throw new InvalidSessionTokenException(
        'El tokenHash debe ser una cadena hexadecimal válida de 64 caracteres (SHA-256).'
      );
    }

    if (!props.expiresAt || !(props.expiresAt instanceof Date) || isNaN(props.expiresAt.getTime())) {
      throw new Error('La fecha de expiración (expiresAt) es obligatoria y debe ser una fecha válida.');
    }

    return new Session(
      props.id,
      props.userId.trim(),
      props.tokenHash.toLowerCase(),
      props.expiresAt,
      props.createdAt,
      props.lastUsedAt,
      props.revokedAt
    );
  }

  /**
   * Reconstituye una sesión existente a partir de datos de persistencia.
   */
  public static reconstitute(props: ReconstituteSessionProps): Session {
    return new Session(
      props.id,
      props.userId,
      props.tokenHash,
      props.expiresAt,
      props.createdAt,
      props.lastUsedAt ?? undefined,
      props.revokedAt ?? undefined
    );
  }

  public get id(): string | undefined {
    return this._id;
  }

  public get userId(): string {
    return this._userId;
  }

  public get tokenHash(): string {
    return this._tokenHash;
  }

  public get expiresAt(): Date {
    return this._expiresAt;
  }

  public get createdAt(): Date | undefined {
    return this._createdAt;
  }

  public get lastUsedAt(): Date | undefined {
    return this._lastUsedAt;
  }

  public get revokedAt(): Date | undefined {
    return this._revokedAt;
  }

  /**
   * Determina si la sesión ha expirado respecto a un instante de referencia.
   */
  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this._expiresAt.getTime();
  }

  /**
   * Determina si la sesión fue explícitamente revocada.
   */
  public isRevoked(): boolean {
    return this._revokedAt !== undefined && this._revokedAt !== null;
  }

  /**
   * Determina si la sesión es válida (no revocada y no expirada).
   */
  public isValid(now: Date = new Date()): boolean {
    return !this.isRevoked() && !this.isExpired(now);
  }

  /**
   * Invalida/revoca la sesión de forma inmediata.
   */
  public revoke(revokedAt: Date = new Date()): void {
    this._revokedAt = revokedAt;
  }

  /**
   * Registra el uso de la sesión tras comprobar su validez.
   */
  public recordUsage(usedAt: Date = new Date()): void {
    if (this.isRevoked()) {
      throw new SessionRevokedException();
    }
    if (this.isExpired(usedAt)) {
      throw new SessionExpiredException();
    }
    this._lastUsedAt = usedAt;
  }
}
