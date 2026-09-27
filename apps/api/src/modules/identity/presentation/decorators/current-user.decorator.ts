import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUserContext } from '../guards/session-auth.guard';

/**
 * Decorador para inyectar el usuario autenticado en los controladores.
 * Extrae el contexto resuelto previamente por SessionAuthGuard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUserContext | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user;
  }
);
