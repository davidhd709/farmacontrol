import { useMemo } from 'react';
import { SYSTEM_ROLES } from '@farmacia/contracts';
import { useAuth } from './useAuth';

/**
 * Hook para consultar de forma reactiva los roles y permisos del usuario autenticado.
 *
 * REGLA DE NEGOCIO RN-AG-05:
 * El renderizado condicional en frontend mejora la experiencia de usuario y evita acciones inválidas,
 * pero NUNCA sustituye la autorización en el backend. Todas las operaciones son estrictamente
 * verificadas por PermissionsGuard en el servidor.
 */
export function usePermissions() {
  const { user } = useAuth();

  const permissionsSet = useMemo(
    () => new Set(user?.permissions ?? []),
    [user?.permissions],
  );

  const rolesSet = useMemo(
    () => new Set(user?.roles ?? []),
    [user?.roles],
  );

  const hasPermission = (permission: string): boolean => {
    return permissionsSet.has(permission);
  };

  const hasAnyPermission = (permissions: string[]): boolean => {
    return permissions.some((perm) => permissionsSet.has(perm));
  };

  const hasAllPermissions = (permissions: string[]): boolean => {
    return permissions.every((perm) => permissionsSet.has(perm));
  };

  const hasRole = (role: string): boolean => {
    return rolesSet.has(role);
  };

  const isAdmin = rolesSet.has(SYSTEM_ROLES.ADMIN);

  return {
    roles: user?.roles ?? [],
    permissions: user?.permissions ?? [],
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    isAdmin,
  };
}
