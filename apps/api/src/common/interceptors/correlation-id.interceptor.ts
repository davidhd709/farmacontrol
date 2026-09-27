import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    if (req && !req.correlationId) {
      const rawHeader =
        req.headers['x-correlation-id'] || req.headers['X-Correlation-Id'];
      const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

      const correlationId =
        headerValue &&
        typeof headerValue === 'string' &&
        /^[a-zA-Z0-9_-]{1,100}$/.test(headerValue.trim())
          ? headerValue.trim()
          : crypto.randomUUID();

      req.correlationId = correlationId;
    }

    const correlationId = req?.correlationId || 'unknown';

    if (res && typeof res.setHeader === 'function') {
      res.setHeader('X-Correlation-Id', correlationId);
    }

    const startTime = Date.now();
    const method = req?.method || 'HTTP';
    const url = req?.originalUrl || req?.url || '';

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          const statusCode = res?.statusCode || 200;
          this.logger.log(
            `${method} ${url} ${statusCode} +${durationMs}ms [corr=${correlationId}]`
          );
        },
        error: (err) => {
          const durationMs = Date.now() - startTime;
          const statusCode = err?.status || err?.statusCode || 500;
          this.logger.warn(
            `${method} ${url} ${statusCode} +${durationMs}ms [corr=${correlationId}] - ${err?.message || 'Error'}`
          );
        },
      })
    );
  }
}
