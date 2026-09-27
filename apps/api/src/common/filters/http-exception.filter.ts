import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const correlationId =
      req?.correlationId ||
      (req?.headers?.['x-correlation-id'] as string) ||
      crypto.randomUUID();

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
    } else if (exception instanceof Error) {
      message = exception.message;
      errorName = exception.name;
    }

    this.logger.error(
      `[${req?.method || 'HTTP'} ${req?.originalUrl || req?.url || ''}] ${status} - ${message} [corr=${correlationId}]`,
      exception instanceof Error ? exception.stack : undefined
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
