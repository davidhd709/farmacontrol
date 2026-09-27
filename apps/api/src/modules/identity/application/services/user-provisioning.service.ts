import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../ports/user.repository.port';
import { PasswordService } from './password.service';
import { User } from '../../domain/entities/user.entity';
import { Username } from '../../domain/value-objects/username.vo';
import { UserAlreadyExistsException } from '../../domain/exceptions/identity.exceptions';

export interface CreateUserCommand {
  username: string;
  password: string;
  isActive?: boolean;
}

export interface ProvisionInitialAdminCommand {
  username: string;
  password: string;
}

@Injectable()
export class UserProvisioningService {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordService: PasswordService
  ) {}

  /**
   * Crea un nuevo usuario en el sistema.
   * Aplica la normalización del Value Object Username, valida unicidad y genera
   * el hash seguro de la contraseña.
   */
  public async createUser(command: CreateUserCommand): Promise<User> {
    const usernameVo = Username.create(command.username);

    const existing = await this.userRepository.findByUsername(usernameVo);
    if (existing) {
      throw new UserAlreadyExistsException(usernameVo.value);
    }

    const passwordHash = await this.passwordService.hashPassword(
      command.password
    );

    const user = User.create({
      username: usernameVo,
      passwordHash,
      isActive: command.isActive ?? true,
    });

    return this.userRepository.create(user);
  }

  /**
   * Aprovisiona de forma controlada y segura el primer usuario del sistema.
   * COMPUERTA DE SEGURIDAD:
   * Si la base de datos ya contiene usuarios, rechaza la operación para evitar
   * re-aprovisionamientos accidentales o sobreescritura de credenciales.
   */
  public async provisionInitialUser(
    command: ProvisionInitialAdminCommand
  ): Promise<User> {
    const existingCount = await this.userRepository.count();
    if (existingCount > 0) {
      throw new Error(
        'Aprovisionamiento rechazado: ya existen usuarios registrados en la base de datos.'
      );
    }

    return this.createUser({
      username: command.username,
      password: command.password,
      isActive: true,
    });
  }
}
