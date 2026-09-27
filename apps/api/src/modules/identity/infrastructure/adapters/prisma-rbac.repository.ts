import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient } from '@farmacia/database';
import { UserRbacContext } from '@farmacia/contracts';
import { RbacRepositoryPort } from '../../application/ports/rbac.repository.port';

@Injectable()
export class PrismaRbacRepository implements RbacRepositoryPort {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  /**
   * Obtiene los roles activos y los permisos consolidados para un usuario.
   * Filtra estrictamente roles inactivos (isActive: false) para que no aporten permisos.
   *
   * @param userId Identificador UUID del usuario.
   */
  public async getUserRbacContext(userId: string): Promise<UserRbacContext> {
    const userRoles = await this.client.userRole.findMany({
      where: {
        userId,
        role: {
          isActive: true,
        },
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
      orderBy: {
        role: {
          name: 'asc',
        },
      },
    });

    const rolesSet = new Set<string>();
    const permissionsSet = new Set<string>();

    for (const ur of userRoles) {
      if (ur.role && ur.role.isActive) {
        rolesSet.add(ur.role.name);
        if (ur.role.rolePermissions) {
          for (const rp of ur.role.rolePermissions) {
            if (rp.permission) {
              permissionsSet.add(rp.permission.name);
            }
          }
        }
      }
    }

    return {
      roles: Array.from(rolesSet).sort(),
      permissions: Array.from(permissionsSet).sort(),
    };
  }
}
