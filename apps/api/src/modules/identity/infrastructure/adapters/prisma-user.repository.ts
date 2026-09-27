import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient } from '@farmacia/database';
import { UserRepositoryPort } from '../../application/ports/user.repository.port';
import { User } from '../../domain/entities/user.entity';
import { Username } from '../../domain/value-objects/username.vo';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  public async findById(id: string): Promise<User | null> {
    const record = await this.client.user.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async findByUsername(
    username: Username | string
  ): Promise<User | null> {
    const normalized =
      username instanceof Username
        ? username.value
        : username.trim().toLowerCase();

    // Consulta con modo insensible a mayúsculas para alinearse con users_username_lower_key
    const record = await this.client.user.findFirst({
      where: {
        username: {
          equals: normalized,
          mode: 'insensitive',
        },
      },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async create(user: User): Promise<User> {
    const record = await this.client.user.create({
      data: {
        ...(user.id ? { id: user.id } : {}),
        username: user.username.value,
        passwordHash: user.passwordHash,
        isActive: user.isActive,
      },
    });

    return this.toDomain(record);
  }

  public async update(user: User): Promise<User> {
    if (!user.id) {
      throw new Error('No se puede actualizar un usuario sin identificador id.');
    }

    const record = await this.client.user.update({
      where: { id: user.id },
      data: {
        username: user.username.value,
        passwordHash: user.passwordHash,
        isActive: user.isActive,
      },
    });

    return this.toDomain(record);
  }

  public async count(): Promise<number> {
    return this.client.user.count();
  }

  private toDomain(record: {
    id: string;
    username: string;
    passwordHash: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return User.reconstitute({
      id: record.id,
      username: record.username,
      passwordHash: record.passwordHash,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
