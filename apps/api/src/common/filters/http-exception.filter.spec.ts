import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@farmacia/database';
import { DomainError, type DomainErrorKind } from '../domain-error';
import { HttpExceptionFilter } from './http-exception.filter';
import { InvalidCashAmountException } from '../../modules/cash/domain/cash.exceptions';
import { CustomerDocumentChangeForbiddenException } from '../../modules/customers/domain/customer.exceptions';
import { ProductNotFoundException } from '../../modules/catalog/domain/exceptions/product.exceptions';
import { DuplicatePurchaseInvoiceException } from '../../modules/purchases/domain/purchase.exceptions';
import {
  InvalidCredentialsException,
  SessionExpiredException,
} from '../../modules/identity/domain/exceptions/identity.exceptions';

function capture(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        url: '/api/v1/test',
        headers: {},
        correlationId: 'test-id',
      }),
      getResponse: () => ({ status, setHeader }),
    }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return {
    code: status.mock.calls[0][0] as number,
    body: json.mock.calls[0][0] as Record<string, unknown>,
  };
}

describe('HttpExceptionFilter domain and Prisma mappings', () => {
  it.each<[DomainErrorKind, number]>([
    ['validation', 400],
    ['unauthorized', 401],
    ['forbidden', 403],
    ['not_found', 404],
    ['conflict', 409],
  ])('maps domain kind %s to %i', (kind, code) => {
    const response = capture(new DomainError('Regla de negocio', kind));
    expect(response.code).toBe(code);
    expect(response.body).toMatchObject({
      statusCode: code,
      message: 'Regla de negocio',
      correlationId: 'test-id',
    });
    expect(response.body).toHaveProperty('timestamp');
  });

  it.each<[Error, number]>([
    [new InvalidCashAmountException(), 400],
    [new CustomerDocumentChangeForbiddenException(), 403],
    [new InvalidCredentialsException(), 401],
    [new SessionExpiredException(), 401],
    [new ProductNotFoundException('missing'), 404],
    [new DuplicatePurchaseInvoiceException('FAC-1'), 409],
  ])('maps %s to %i', (error, code) => {
    expect(capture(error).code).toBe(code);
  });

  it.each<[string, number]>([
    ['P2002', 409],
    ['P2003', 409],
    ['P2004', 409],
    ['P2028', 409],
    ['P2034', 409],
    ['P2025', 404],
  ])('maps Prisma %s to %i without exposing its message', (prismaCode, code) => {
    const error = new Prisma.PrismaClientKnownRequestError('private database detail', {
      code: prismaCode,
      clientVersion: '7.0.0',
    });
    const response = capture(error);
    expect(response.code).toBe(code);
    expect(response.body.message).not.toContain('private database detail');
  });

  it('preserves an existing HTTP status', () => {
    expect(capture(new BadRequestException('Ya mapeado')).code).toBe(400);
  });

  it('does not expose unknown Prisma errors in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const error = new Prisma.PrismaClientKnownRequestError('private database detail', {
        code: 'P9999',
        clientVersion: '7.0.0',
      });
      const response = capture(error);
      expect(response.code).toBe(500);
      expect(response.body.message).toBe('Error interno del servidor.');
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('sanitizes and logs unexpected errors with the correlation identifier', () => {
    const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const response = capture(new Error('private accounting database detail'));
    expect(response.code).toBe(500);
    expect(response.body).toMatchObject({
      message: 'Error interno del servidor.',
      correlationId: 'test-id',
    });
    expect(response.body.message).not.toContain('private accounting database detail');
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('[corr=test-id]'),
      expect.stringContaining('private accounting database detail'),
    );
    loggerSpy.mockRestore();
  });
});
