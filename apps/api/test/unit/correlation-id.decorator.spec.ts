import { describe, it, expect } from 'vitest';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { CorrelationId } from '../../src/common/decorators/correlation-id.decorator';

describe('CorrelationId Decorator (Unit)', () => {
  function getParamDecoratorFactory(decorator: Function) {
    class TestClass {
      public testMethod(@decorator() _param: string) {}
    }

    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'testMethod');
    const key = Object.keys(args)[0];
    return args[key].factory;
  }

  it('debe extraer el correlationId asignado a la request', () => {
    const factory = getParamDecoratorFactory(CorrelationId);

    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({ correlationId: 'my-corr-uuid-123' } as Request),
      }),
    } as unknown as ExecutionContext;

    const result = factory(null, mockExecutionContext);
    expect(result).toBe('my-corr-uuid-123');
  });

  it('debe generar un UUID fallback si la request no tiene correlationId', () => {
    const factory = getParamDecoratorFactory(CorrelationId);

    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({} as Request),
      }),
    } as unknown as ExecutionContext;

    const result = factory(null, mockExecutionContext);
    expect(result).toBeDefined();
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
