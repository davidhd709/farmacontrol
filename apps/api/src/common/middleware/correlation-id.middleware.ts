import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Middleware que garantiza la presencia del identificador único de trazabilidad (correlationId)
 * en cada solicitud HTTP entrante y en su respuesta saliente.
 *
 * Si el cliente envía un header `X-Correlation-Id` válido (alfanumérico, guiones, max 100 caracteres),
 * se reutiliza para mantener trazabilidad transversal. De lo contrario, se genera un UUID v4.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  public use(req: Request, res: Response, next: NextFunction): void {
    const rawHeader =
      req.headers[CORRELATION_ID_HEADER] ||
      req.headers['x-correlation-id'] ||
      req.headers['X-Correlation-Id'];

    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    let correlationId: string;
    if (
      headerValue &&
      typeof headerValue === 'string' &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(headerValue.trim())
    ) {
      correlationId = headerValue.trim();
    } else {
      correlationId = crypto.randomUUID();
    }

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);

    next();
  }
}
