import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import type { Request, Response } from 'express';
import { CorrelationIdInterceptor } from '../../src/common/interceptors/correlation-id.interceptor';

describe('CorrelationIdInterceptor (Unit)', () => {
  const interceptor = new CorrelationIdInterceptor();

  it('debe asegurar el header X-Correlation-Id en la respuesta y pasar el flujo', async () => {
    const setHeaderMock = vi.fn();
    const req = {
      correlationId: 'interceptor-corr-1',
      headers: {},
      method: 'GET',
      originalUrl: '/api/v1/auth/me',
    } as unknown as Request;

    const res = {
      setHeader: setHeaderMock,
      statusCode: 200,
    } as unknown as Response;

    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = {
      handle: () => of({ ok: true }),
    };

    const observable$ = interceptor.intercept(context, next);

    await new Promise<void>((resolve) => {
      observable$.subscribe({
        next: (val) => {
          expect(val).toEqual({ ok: true });
          expect(setHeaderMock).toHaveBeenCalledWith('X-Correlation-Id', 'interceptor-corr-1');
          resolve();
        },
      });
    });
  });
});
