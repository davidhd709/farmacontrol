import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Decorador de parámetro para inyectar directamente el correlationId
 * activo de la solicitud en controladores HTTP.
 */
export const CorrelationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.correlationId || crypto.randomUUID();
  }
);
