import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorador de metadatos para restringir el acceso a un endpoint o controlador
 * exigiendo permisos específicos (RBAC).
 *
 * Se utiliza en combinación con SessionAuthGuard y PermissionsGuard:
 * ```ts
 * @UseGuards(SessionAuthGuard, PermissionsGuard)
 * @RequirePermissions(SYSTEM_PERMISSIONS.SALES_CREATE)
 * @Post('sales')
 * ```
 *
 * @param permissions Identificadores atómicos de permisos requeridos.
 */
export const RequirePermissions = (
  ...permissions: string[]
): CustomDecorator<string> => SetMetadata(PERMISSIONS_KEY, permissions);
