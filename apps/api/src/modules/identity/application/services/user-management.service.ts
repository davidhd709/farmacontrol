import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma } from '@farmacia/database';
import type {
  CreateSystemUserDto,
  SystemRoleItemDto,
  SystemUserListItemDto,
} from '@farmacia/contracts';
import { PasswordService } from './password.service';
import { Username } from '../../domain/value-objects/username.vo';

@Injectable()
export class UserManagementService {
  constructor(private readonly passwordService: PasswordService) {}

  /**
   * Lista todos los usuarios con sus roles y estados.
   */
  public async listUsers(): Promise<SystemUserListItemDto[]> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      mustChangePassword: u.mustChangePassword,
      roles: u.userRoles.map((ur) => ur.role.name),
    }));
  }

  /**
   * Lista todos los roles disponibles en el sistema.
   */
  public async listRoles(): Promise<SystemRoleItemDto[]> {
    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isActive: r.isActive,
    }));
  }

  /**
   * Crea un nuevo usuario y le asigna sus roles.
   */
  public async createUser(dto: CreateSystemUserDto): Promise<SystemUserListItemDto> {
    if (!dto.username || dto.username.trim().length < 3) {
      throw new BadRequestException('El nombre de usuario debe contener al menos 3 caracteres.');
    }
    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres.');
    }

    const normalizedUsername = Username.create(dto.username).value;

    const existing = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });
    if (existing) {
      throw new ConflictException(`El usuario "${normalizedUsername}" ya existe en el sistema.`);
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);

    // Buscar IDs de los roles solicitados
    const roleRecords =
      dto.roles && dto.roles.length > 0
        ? await prisma.role.findMany({
            where: { name: { in: dto.roles } },
          })
        : [];

    const created = await prisma.user.create({
      data: {
        username: normalizedUsername,
        passwordHash,
        isActive: dto.isActive ?? true,
        mustChangePassword: true,
        userRoles: {
          create: roleRecords.map((r) => ({
            roleId: r.id,
          })),
        },
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    return {
      id: created.id,
      username: created.username,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
      mustChangePassword: created.mustChangePassword,
      roles: created.userRoles.map((ur) => ur.role.name),
    };
  }

  /**
   * Cambia el estado de activación de un usuario.
   */
  public async updateUserStatus(id: string, isActive: boolean): Promise<SystemUserListItemDto> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      username: updated.username,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      mustChangePassword: updated.mustChangePassword,
      roles: updated.userRoles.map((ur) => ur.role.name),
    };
  }

  /**
   * Actualiza los roles asignados a un usuario.
   */
  public async updateUserRoles(id: string, roles: string[]): Promise<SystemUserListItemDto> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
    }

    const targetRoles = await prisma.role.findMany({
      where: { name: { in: roles } },
    });

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: id },
      });

      if (targetRoles.length > 0) {
        await tx.userRole.createMany({
          data: targetRoles.map((r) => ({
            userId: id,
            roleId: r.id,
          })),
        });
      }
    });

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    return {
      id: refreshed.id,
      username: refreshed.username,
      isActive: refreshed.isActive,
      createdAt: refreshed.createdAt.toISOString(),
      mustChangePassword: refreshed.mustChangePassword,
      roles: refreshed.userRoles.map((ur) => ur.role.name),
    };
  }

  /** Restablece una clave desde el gestor y cierra todas las sesiones del destinatario. */
  public async resetPassword(
    targetId: string,
    newPassword: string,
    actorId: string,
  ): Promise<void> {
    const passwordHash = await this.passwordService.hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<Array<{ id: string; username: string }>>`
        SELECT id, username FROM users WHERE id = ${targetId}::uuid FOR UPDATE
      `;
      const target = users[0];
      if (!target) throw new NotFoundException('Usuario no encontrado.');

      await tx.user.update({
        where: { id: targetId },
        data: { passwordHash, mustChangePassword: true },
      });
      await tx.session.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          userId: actorId,
          action: 'auth:password_reset_by_manager',
          entity: 'User',
          entityId: targetId,
          details: { targetUsername: target.username },
        },
      });
    });
  }

  /** Cambia la clave propia tras comprobar la actual y revoca todas las sesiones. */
  public async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (
      typeof currentPassword !== 'string' ||
      currentPassword.length > PasswordService.MAX_PASSWORD_LENGTH
    ) {
      throw new BadRequestException('La contraseña actual tiene un formato inválido.');
    }
    const passwordHash = await this.passwordService.hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<
        Array<{ id: string; password_hash: string; is_active: boolean }>
      >`
        SELECT id, password_hash, is_active FROM users WHERE id = ${userId}::uuid FOR UPDATE
      `;
      const user = users[0];
      if (
        !user?.is_active ||
        !(await this.passwordService.verifyPassword(currentPassword, user.password_hash))
      ) {
        throw new UnauthorizedException('La contraseña actual es incorrecta.');
      }
      if (await this.passwordService.verifyPassword(newPassword, user.password_hash)) {
        throw new BadRequestException('La nueva contraseña debe ser diferente de la actual.');
      }

      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          userId,
          action: 'auth:password_changed_by_user',
          entity: 'User',
          entityId: userId,
          details: { method: 'self_service' },
        },
      });
    });
  }
}
