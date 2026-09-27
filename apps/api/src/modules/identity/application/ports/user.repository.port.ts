import { User } from '../../domain/entities/user.entity';
import { Username } from '../../domain/value-objects/username.vo';

export const USER_REPOSITORY_PORT = Symbol('USER_REPOSITORY_PORT');

/**
 * Puerto para persistencia y recuperación de entidades User.
 * Desacoplado de la tecnología de base de datos o cliente ORM.
 */
export interface UserRepositoryPort {
  findById(id: string): Promise<User | null>;
  findByUsername(username: Username | string): Promise<User | null>;
  create(user: User): Promise<User>;
  update(user: User): Promise<User>;
  count(): Promise<number>;
}
