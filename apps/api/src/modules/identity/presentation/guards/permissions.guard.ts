import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthenticatedUserContext } from './session-auth.guard';

/**
 * Guard de autorización basado en permisos atómicos (RBAC).
 *
 * Responsabilidades:
 * 1. Extraer los permisos requeridos declarados con @RequirePermissions() a nivel de método o clase.
 * 2. Si no se declararon permisos, permitir el acceso automáticamente (return true).
 * 3. Si se declararon permisos, verificar que la petición cuente con contexto autenticado (request.user).
 *    Si no existe usuario autenticado, lanzar 401 Unauthorized.
 * 4. Verificar que el usuario posea todos y cada uno de los permisos requeridos.
 * 5. Si falta al menos un permiso, denegar el acceso lanzando 403 Forbidden estandarizado.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    // Si la ruta no especifica requerimientos de permisos RBAC, permitir acceso
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUserContext | undefined;

    if (!user) {
      throw new UnauthorizedException('No autenticado.');
    }

    const userPermissions = new Set(user.permissions ?? []);
    const hasAllPermissions = requiredPermissions.every((perm) =>
      userPermissions.has(perm)
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Acceso denegado. Permisos insuficientes.');
    }

    return true;
  }
}
