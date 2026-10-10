import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parsePaginationValue, MAX_PAGE_SIZE } from '../../src/common/pagination/pagination';
import {
  QueryFieldValidationPipe,
  RequestShapeValidationPipe,
} from '../../src/common/pagination/request-shape.pipe';

describe('Validación de entrada de API', () => {
  it.each(['NaN', '-1', '0', '1.5', '1abc', ''])('rechaza page=%s', (value) => {
    expect(() => parsePaginationValue(value, 'page')).toThrow(BadRequestException);
  });

  it.each(['NaN', '-1', '0', '1.5', '101', '99999999999999999999'])(
    'rechaza pageSize=%s',
    (value) => {
      expect(() => parsePaginationValue(value, 'pageSize')).toThrow(BadRequestException);
    },
  );

  it('acepta el máximo que solicita el frontend', () => {
    expect(MAX_PAGE_SIZE).toBe(100);
    expect(parsePaginationValue('100', 'limit')).toBe(100);
    expect(parsePaginationValue(undefined, 'pageSize', 20)).toBe(20);
  });

  it('rechaza un body mal formado antes de ejecutar el caso de uso', () => {
    const pipe = new RequestShapeValidationPipe({ categoryId: 'uuid', amount: 'decimal' });
    expect(() => pipe.transform({ categoryId: 'bad', amount: 'NaN' })).toThrow(BadRequestException);
    expect(() =>
      pipe.transform({ categoryId: '550e8400-e29b-41d4-a716-446655440000', amount: 'NaN' }),
    ).toThrow(BadRequestException);
  });

  it('rechaza un UUID inválido en query y params', async () => {
    expect(() => new QueryFieldValidationPipe('productId', 'uuid').transform('bad')).toThrow(
      BadRequestException,
    );
    await expect(new ParseUUIDPipe().transform('bad', { type: 'param' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
