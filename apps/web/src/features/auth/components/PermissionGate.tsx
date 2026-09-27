import type { ReactNode } from 'react';
import { usePermissions } from '../hooks/usePermissions';

export interface PermissionGateProps {
  /** Permiso único requerido */
  permission?: string;
  /** Lista de permisos requeridos donde se requiere AL MENOS UNO */
  anyOf?: string[];
  /** Lista de permisos requeridos donde se requieren TODOS */
  allOf?: string[];
  /** Rol requerido */
  role?: string;
  /** Contenido a mostrar cuando se cumplen los permisos */
  children: ReactNode;
  /** Contenido opcional a mostrar cuando NO se cumplen los permisos */
  fallback?: ReactNode;
}

/**
 * Componente declarativo para renderizado condicional de elementos de la UI según permisos RBAC.
 *
 * REGLA DE NEGOCIO RN-AG-05:
 * Ocultar o deshabilitar elementos visuales en el cliente optimiza la usabilidad y previene errores,
 * pero toda operación protegida debe estar validada de forma inviolable por el backend.
 */
export function PermissionGate({
  permission,
  anyOf,
  allOf,
  role,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, hasRole } = usePermissions();

  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>;
  }

  if (anyOf && anyOf.length > 0 && !hasAnyPermission(anyOf)) {
    return <>{fallback}</>;
  }

  if (allOf && allOf.length > 0 && !hasAllPermissions(allOf)) {
    return <>{fallback}</>;
  }

  if (role && !hasRole(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
