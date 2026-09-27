import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { CorrelationIdMiddleware } from '../../src/common/middleware/correlation-id.middleware';

describe('CorrelationIdMiddleware (Unit)', () => {
  const middleware = new CorrelationIdMiddleware();

  it('debe generar un UUID v4 y establecer X-Correlation-Id cuando no se proporciona header', () => {
    const req = {
      headers: {},
    } as unknown as Request;

    const setHeaderMock = vi.fn();
    const res = {
      setHeader: setHeaderMock,
    } as unknown as Response;

    const next: NextFunction = vi.fn();

    middleware.use(req, res, next);

    expect(req.correlationId).toBeDefined();
    expect(req.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(setHeaderMock).toHaveBeenCalledWith('X-Correlation-Id', req.correlationId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('debe preservar un correlationId válido enviado por el cliente', () => {
    const req = {
      headers: {
        'x-correlation-id': 'client-custom-corr-12345',
      },
    } as unknown as Request;

    const setHeaderMock = vi.fn();
    const res = {
      setHeader: setHeaderMock,
    } as unknown as Response;

    const next: NextFunction = vi.fn();

    middleware.use(req, res, next);

    expect(req.correlationId).toBe('client-custom-corr-12345');
    expect(setHeaderMock).toHaveBeenCalledWith(
      'X-Correlation-Id',
      'client-custom-corr-12345'
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('debe descartar correlationId malicioso o con caracteres inválidos y generar uno nuevo seguro', () => {
    const req = {
      headers: {
        'x-correlation-id': '<script>alert(1)</script>; DROP TABLE users;--',
      },
    } as unknown as Request;

    const setHeaderMock = vi.fn();
    const res = {
      setHeader: setHeaderMock,
    } as unknown as Response;

    const next: NextFunction = vi.fn();

    middleware.use(req, res, next);

    expect(req.correlationId).not.toContain('<script>');
    expect(req.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(setHeaderMock).toHaveBeenCalledWith('X-Correlation-Id', req.correlationId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('debe descartar un correlationId que exceda 100 caracteres y generar un UUID seguro', () => {
    const req = {
      headers: {
        'x-correlation-id': 'a'.repeat(101),
      },
    } as unknown as Request;

    const setHeaderMock = vi.fn();
    const res = {
      setHeader: setHeaderMock,
    } as unknown as Response;

    const next: NextFunction = vi.fn();

    middleware.use(req, res, next);

    expect(req.correlationId?.length).toBe(36); // UUID length
    expect(setHeaderMock).toHaveBeenCalledWith('X-Correlation-Id', req.correlationId);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
