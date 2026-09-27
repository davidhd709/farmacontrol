import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../src/modules/identity/presentation/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../src/modules/identity/presentation/decorators/require-permissions.decorator';
import { AuthenticatedUserContext } from '../../src/modules/identity/presentation/guards/session-auth.guard';

describe('PermissionsGuard (Unit)', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  function createMockExecutionContext(user?: AuthenticatedUserContext): ExecutionContext {
    const request = {
      user,
    };

    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('debe permitir el acceso si no hay permisos requeridos en el decorador', () => {
    const context = createMockExecutionContext();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('debe permitir el acceso si el array de permisos requeridos está vacío', () => {
    const context = createMockExecutionContext();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('debe lanzar 401 Unauthorized si se exigen permisos pero no hay usuario autenticado en la petición', () => {
    const context = createMockExecutionContext(undefined);
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales:create']);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('debe lanzar 403 Forbidden si el usuario no tiene ninguno de los permisos requeridos', () => {
    const context = createMockExecutionContext({
      id: 'user-1',
      username: 'cajero1',
      sessionId: 'sess-1',
      roles: ['cajero'],
      permissions: ['sales:create', 'sales:read'],
    });
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['users:delete']);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Acceso denegado. Permisos insuficientes.');
  });

  it('debe lanzar 403 Forbidden si el usuario tiene solo una parte de los permisos requeridos', () => {
    const context = createMockExecutionContext({
      id: 'user-1',
      username: 'cajero1',
      sessionId: 'sess-1',
      roles: ['cajero'],
      permissions: ['sales:create'],
    });
    // Se requieren ambos
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales:create', 'inventory:adjust']);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('debe permitir el acceso si el usuario posee todos los permisos requeridos', () => {
    const context = createMockExecutionContext({
      id: 'user-1',
      username: 'admin1',
      sessionId: 'sess-1',
      roles: ['admin'],
      permissions: ['sales:create', 'inventory:adjust', 'users:delete'],
    });
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['sales:create', 'inventory:adjust']);

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });
});
