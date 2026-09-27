import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../ports/user.repository.port';
import {
  PASSWORD_HASHER_PORT,
  PasswordHasherPort,
} from '../ports/password-hasher.port';
import {
  RBAC_REPOSITORY_PORT,
  RbacRepositoryPort,
} from '../ports/rbac.repository.port';
import { SessionService } from './session.service';
import { User } from '../../domain/entities/user.entity';
import { Username } from '../../domain/value-objects/username.vo';
import {
  InvalidCredentialsException,
  InvalidUsernameException,
} from '../../domain/exceptions/identity.exceptions';

/**
 * Hash Argon2id precalculado con parámetros estándar (64 MiB, t=3, p=4) para mitigar
 * ataques de canal lateral por análisis de tiempos (timing attacks).
 * Si el usuario no existe o está inactivo, se ejecuta la verificación contra este hash
 * para garantizar un tiempo de respuesta uniforme que impida la enumeración de usuarios.
 */
export const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$5avj9fBh9KI0ca1tg3D27g$vR8PoO5ZOxDhG67U06vamRr2hdjdUxpttqBZ2YYRkTE';

export interface LoginResult {
  user: User;
  rawToken: string;
  roles: string[];
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepository: UserRepositoryPort,
    @Inject(PASSWORD_HASHER_PORT)
    private readonly passwordHasher: PasswordHasherPort,
    private readonly sessionService: SessionService,
    @Inject(RBAC_REPOSITORY_PORT)
    private readonly rbacRepository: RbacRepositoryPort
  ) {}

  /**
   * Ejecuta el inicio de sesión validando credenciales locales y emitiendo una sesión opaca.
   * Aplica mitigación estricta contra enumeración de usuarios y timing attacks.
   *
   * @param usernameInput Nombre de usuario candidado.
   * @param passwordInput Contraseña en texto plano.
   * @returns Entidad User y rawToken para la cookie HttpOnly.
   */
  public async login(
    usernameInput: string,
    passwordInput: string
  ): Promise<LoginResult> {
    if (!usernameInput || !passwordInput) {
      throw new InvalidCredentialsException();
    }

    let usernameVo: Username;
    try {
      usernameVo = Username.create(usernameInput);
    } catch (err) {
      if (err instanceof InvalidUsernameException) {
        // Ejecutar verificación dummy para igualar el tiempo de cómputo y no revelar que el username es inválido
        await this.passwordHasher.verify(passwordInput, DUMMY_ARGON2_HASH);
        throw new InvalidCredentialsException();
      }
      throw err;
    }

    const user = await this.userRepository.findByUsername(usernameVo);

    // Si el usuario no existe o está desactivado, ejecutar verificación dummy
    if (!user || !user.isActive) {
      await this.passwordHasher.verify(passwordInput, DUMMY_ARGON2_HASH);
      throw new InvalidCredentialsException();
    }

    // Verificar la contraseña real contra el hash almacenado en PostgreSQL
    const isPasswordValid = await this.passwordHasher.verify(
      passwordInput,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    // Crear la sesión opaca asociada al usuario (genera 256 bits CSPRNG y persiste hash)
    const { rawToken } = await this.sessionService.createSession(user.id!);

    // Obtener roles activos y permisos consolidados
    const rbacContext = await this.rbacRepository.getUserRbacContext(user.id!);

    return {
      user,
      rawToken,
      roles: rbacContext.roles,
      permissions: rbacContext.permissions,
    };
  }

  /**
   * Cierra la sesión activa revocándola en la base de datos de forma idempotente.
   *
   * @param rawToken Token en texto plano extraído de la cookie.
   */
  public async logout(rawToken?: string): Promise<void> {
    if (!rawToken) {
      return;
    }

    await this.sessionService.revokeSession(rawToken);
  }
}
