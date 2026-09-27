import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../../application/services/session.service';
import {
  USER_REPOSITORY_PORT,
  UserRepositoryPort,
} from '../../application/ports/user.repository.port';
import {
  RBAC_REPOSITORY_PORT,
  RbacRepositoryPort,
} from '../../application/ports/rbac.repository.port';
import { extractTokenFromCookieHeader } from '../utils/session-cookie.util';

export interface AuthenticatedUserContext {
  id: string;
  username: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUserContext;
    }
  }
}

/**
 * Guard de autenticación basado en sesiones opacas en cookies HttpOnly.
 *
 * Responsabilidades:
 * 1. Extraer rawToken desde la cookie segura 'sid'.
 * 2. Validar validez, expiración y revocación de la sesión en SessionService.
 * 3. Verificar que el usuario propietario continúe existiendo y activo.
 * 4. Obtener roles activos y permisos consolidados mediante RbacRepositoryPort.
 * 5. Adjuntar un contexto autenticado seguro y estrictamente tipado a request.user.
 * 6. Rechazar peticiones inválidas con HTTP 401 Unauthorized.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
    @Inject(USER_REPOSITORY_PORT)
    private readonly userRepository: UserRepositoryPort,
    @Inject(RBAC_REPOSITORY_PORT)
    private readonly rbacRepository: RbacRepositoryPort
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawToken = extractTokenFromCookieHeader(request.headers.cookie);

    if (!rawToken) {
      throw new UnauthorizedException('No autenticado. Cookie de sesión ausente.');
    }

    const session = await this.sessionService.validateSession(rawToken);
    if (!session) {
      throw new UnauthorizedException('Sesión inválida, expirada o revocada.');
    }

    const user = await this.userRepository.findById(session.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no válido o desactivado.');
    }

    const rbacContext = await this.rbacRepository.getUserRbacContext(user.id!);

    // Contexto autenticado seguro (sin hashes ni tokens) con roles y permisos consolidados
    request.user = {
      id: user.id!,
      username: user.username.value,
      sessionId: session.id!,
      roles: rbacContext.roles,
      permissions: rbacContext.permissions,
    };

    return true;
  }
}
