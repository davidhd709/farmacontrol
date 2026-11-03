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

export const ANY_PERMISSIONS_KEY = 'anyPermissions';

/**
 * Exige AL MENOS UNO de los permisos indicados. Para rutas cuyo alcance lo decide el servicio
 * según el permiso que tenga el usuario (p. ej. el directorio de terceros filtrado por tipo).
 */
export const RequireAnyPermissions = (
  ...permissions: string[]
): CustomDecorator<string> => SetMetadata(ANY_PERMISSIONS_KEY, permissions);
