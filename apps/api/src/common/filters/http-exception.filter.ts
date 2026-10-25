import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@farmacia/database';
import { DomainError } from '../domain-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const correlationId =
      req?.correlationId || (req?.headers?.['x-correlation-id'] as string) || crypto.randomUUID();

    if (res && typeof res.setHeader === 'function') {
      res.setHeader('X-Correlation-Id', correlationId);
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno del servidor.';
    let errorName = 'Internal Server Error';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resBody = exception.getResponse();

      if (typeof resBody === 'string') {
        message = resBody;
        errorName = exception.name;
      } else if (typeof resBody === 'object' && resBody !== null) {
        const body = resBody as Record<string, unknown>;
        message = (body.message as string) || exception.message;
        errorName = (body.error as string) || exception.name;
        details = body.details;
      }
    } else if (exception instanceof DomainError) {
      const statusByKind = {
        validation: HttpStatus.BAD_REQUEST,
        unauthorized: HttpStatus.UNAUTHORIZED,
        forbidden: HttpStatus.FORBIDDEN,
        not_found: HttpStatus.NOT_FOUND,
        conflict: HttpStatus.CONFLICT,
      } as const;
      status = statusByKind[exception.kind];
      message = exception.message;
      errorName = exception.name;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const controlModeConflict = inventoryControlModeConflictMessage(exception);
      if (controlModeConflict) {
        status = HttpStatus.CONFLICT;
        message = controlModeConflict;
        errorName = 'Conflict';
      } else if (['P2002', 'P2003', 'P2004', 'P2034', 'P2028'].includes(exception.code)) {
        status = HttpStatus.CONFLICT;
        message = 'Conflicto de datos. La operación no pudo completarse.';
        errorName = 'Conflict';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'El recurso solicitado no fue encontrado.';
        errorName = 'Not Found';
      } else if (process.env.NODE_ENV === 'production') {
        errorName = 'InternalServerError';
      }
    } else if (exception instanceof Error) {
      message = 'Error interno del servidor.';
      errorName = 'InternalServerError';
    }

    this.logger.error(
      `[${req?.method || 'HTTP'} ${req?.originalUrl || req?.url || ''}] ${status} - ${message} [corr=${correlationId}]`,
      exception instanceof Error ? exception.stack : undefined,
    );

    res.status(status).json({
      statusCode: status,
      message,
      error: errorName,
      correlationId,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Triggers de modo de control de inventario (F4, ADR-006): llegan como P2004 desde Prisma o
 * como P2010 (SQLSTATE 23514) desde SQL directo, p. ej. si el modo cambia durante una recepción.
 */
function inventoryControlModeConflictMessage(
  exception: Prisma.PrismaClientKnownRequestError,
): string | null {
  const isCheckViolation =
    exception.code === 'P2004' ||
    (exception.code === 'P2010' &&
      (exception.meta as { code?: string } | undefined)?.code === '23514');
  if (!isCheckViolation) return null;
  const detail = `${exception.message} ${JSON.stringify(exception.meta ?? {})}`;
  if (detail.includes('INVENTORY_CONTROL_MODE_LOCKED:')) {
    return 'El producto tiene existencias registradas: su modo de control de inventario no puede cambiar.';
  }
  if (
    detail.includes('INVENTORY_CONTROL_MODE_MISMATCH:') ||
    detail.includes('INVENTORY_LOT_IDENTITY_IMMUTABLE:')
  ) {
    return 'El modo de control de inventario del producto cambió durante la operación. Revise el producto y vuelva a intentarlo.';
  }
  return null;
}
