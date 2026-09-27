import { UserRbacContext } from '@farmacia/contracts';

export const RBAC_REPOSITORY_PORT = Symbol('RBAC_REPOSITORY_PORT');

/**
 * Puerto de repositorio para consultar roles y permisos efectivos de un usuario.
 * Desacoplado de la tecnología de persistencia ORM / Prisma.
 */
export interface RbacRepositoryPort {
  /**
   * Obtiene los roles activos y la lista consolidada y sin duplicados de permisos asignados a un usuario.
   * Si un rol está desactivado (isActive = false), sus permisos no se incluyen.
   */
  getUserRbacContext(userId: string): Promise<UserRbacContext>;
}
