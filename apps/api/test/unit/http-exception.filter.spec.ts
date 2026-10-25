import { describe, it, expect, vi } from 'vitest';
import { ArgumentsHost, Logger, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@farmacia/database';
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
      }),
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
    const logSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(setHeaderMock).toHaveBeenCalledWith('X-Correlation-Id', 'req-corr-err-500');
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Error interno del servidor.',
        error: 'InternalServerError',
        correlationId: 'req-corr-err-500',
      }),
    );
    expect(jsonMock.mock.calls[0][0]).not.toHaveProperty('stack');
    expect(jsonMock.mock.calls[0][0].message).not.toContain('Unexpected database failure');
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[corr=req-corr-err-500]'),
      exception.stack,
    );
    logSpy.mockRestore();
  });

  describe('triggers de modo de control de inventario (F4)', () => {
    const run = (exception: unknown) => {
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const host = createMockHost(
        { method: 'POST', url: '/api/v1/purchases', correlationId: 'c', headers: {} },
        { status: statusMock, setHeader: vi.fn() },
      );
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      filter.catch(exception, host);
      return { status: statusMock.mock.calls[0][0], body: jsonMock.mock.calls[0][0] };
    };
    const rawError = (code: string, message: string) =>
      new Prisma.PrismaClientKnownRequestError(message, {
        code: 'P2010',
        clientVersion: 'test',
        meta: { code, message },
      });

    it('traduce a 409 el trigger disparado desde SQL directo (P2010 / 23514)', () => {
      const { status, body } = run(
        rawError('23514', 'INVENTORY_CONTROL_MODE_MISMATCH: producto x, modo vigente SERVICE'),
      );
      expect(status).toBe(409);
      expect(body.message).toMatch(/modo de control de inventario del producto cambió/);
    });

    it('traduce a 409 el bloqueo del cambio de modo con existencias', () => {
      const { status, body } = run(
        rawError('23514', 'INVENTORY_CONTROL_MODE_LOCKED: el producto x tiene existencias'),
      );
      expect(status).toBe(409);
      expect(body.message).toMatch(/tiene existencias registradas/);
    });

    it('deja en 500 cualquier otro error de SQL directo', () => {
      const { status } = run(rawError('23514', 'otra restricción'));
      expect(status).toBe(500);
    });
  });
});
