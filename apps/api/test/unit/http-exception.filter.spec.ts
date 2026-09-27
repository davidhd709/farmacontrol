import { describe, it, expect, vi } from 'vitest';
import { ArgumentsHost, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

describe('HttpExceptionFilter (Unit)', () => {
  const filter = new HttpExceptionFilter();

  function createMockHost(req: Partial<Request>, res: Partial<Response>): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getRequest: () => req as Request,
        getResponse: () => res as Response,
      }),
    } as unknown as ArgumentsHost;
  }

  it('debe interceptar HttpException formateando el cuerpo con statusCode, message y correlationId', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const setHeaderMock = vi.fn();

    const req: Partial<Request> = {
      method: 'GET',
      url: '/api/v1/auth/me',
      correlationId: 'req-corr-test-123',
      headers: {},
    };

    const res: Partial<Response> = {
      status: statusMock,
      setHeader: setHeaderMock,
    };

    const host = createMockHost(req, res);
    const exception = new UnauthorizedException('No autenticado.');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(setHeaderMock).toHaveBeenCalledWith('X-Correlation-Id', 'req-corr-test-123');
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'No autenticado.',
        error: 'Unauthorized',
        correlationId: 'req-corr-test-123',
      })
    );
  });

  it('debe manejar errores no controlados como 500 preservando el correlationId', () => {
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const setHeaderMock = vi.fn();

    const req: Partial<Request> = {
      method: 'POST',
      url: '/api/v1/unknown',
      correlationId: 'req-corr-err-500',
      headers: {},
    };

    const res: Partial<Response> = {
      status: statusMock,
      setHeader: setHeaderMock,
    };

    const host = createMockHost(req, res);
    const exception = new Error('Unexpected database failure');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(setHeaderMock).toHaveBeenCalledWith('X-Correlation-Id', 'req-corr-err-500');
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Unexpected database failure',
        correlationId: 'req-corr-err-500',
      })
    );
  });
});
