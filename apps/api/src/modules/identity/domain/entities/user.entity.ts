import { Username } from '../value-objects/username.vo';

export interface CreateUserProps {
  id?: string;
  username: Username | string;
  passwordHash: string;
  isActive?: boolean;
}

export interface ReconstituteUserProps {
  id: string;
  username: string;
  passwordHash: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entidad de dominio pura de Usuario para Identidad y Autenticación.
 * Desacoplada de Prisma, PostgreSQL y NestJS.
 */
export class User {
  private readonly _id?: string;
  private readonly _username: Username;
  private _passwordHash: string;
  private _isActive: boolean;
  private readonly _createdAt?: Date;
  private _updatedAt?: Date;

  private constructor(
    id: string | undefined,
    username: Username,
    passwordHash: string,
    isActive: boolean,
    createdAt?: Date,
    updatedAt?: Date
  ) {
    this._id = id;
    this._username = username;
    this._passwordHash = passwordHash;
    this._isActive = isActive;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  /**
   * Crea una nueva entidad de usuario de dominio (para nuevo registro).
   */
  public static create(props: CreateUserProps): User {
    const usernameVo =
      props.username instanceof Username
        ? props.username
        : Username.create(props.username);

    if (!props.passwordHash || props.passwordHash.trim().length === 0) {
      throw new Error('El hash de contraseña es obligatorio.');
    }

    return new User(
      props.id,
      usernameVo,
      props.passwordHash,
      props.isActive ?? true
    );
  }

  /**
   * Reconstituye una entidad de usuario existente a partir de datos de persistencia.
   */
  public static reconstitute(props: ReconstituteUserProps): User {
    const usernameVo = Username.create(props.username);
    return new User(
      props.id,
      usernameVo,
      props.passwordHash,
      props.isActive,
      props.createdAt,
      props.updatedAt
    );
  }

  public get id(): string | undefined {
    return this._id;
  }

  public get username(): Username {
    return this._username;
  }

  public get passwordHash(): string {
    return this._passwordHash;
  }

  public get isActive(): boolean {
    return this._isActive;
  }

  public get createdAt(): Date | undefined {
    return this._createdAt;
  }

  public get updatedAt(): Date | undefined {
    return this._updatedAt;
  }

  public deactivate(): void {
    this._isActive = false;
  }

  public activate(): void {
    this._isActive = true;
  }

  public updatePasswordHash(newPasswordHash: string): void {
    if (!newPasswordHash || newPasswordHash.trim().length === 0) {
      throw new Error('El nuevo hash de contraseña no puede estar vacío.');
    }
    this._passwordHash = newPasswordHash;
  }
}
