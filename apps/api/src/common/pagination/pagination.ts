import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/** El frontend pide como máximo 100 filas (selectores y tablas con pageSize: 100). */
export const MAX_PAGE_SIZE = 100;

export function parsePaginationValue(
  value: unknown,
  field: 'page' | 'pageSize' | 'limit',
  defaultValue: number,
): number;
export function parsePaginationValue(
  value: unknown,
  field: 'page' | 'pageSize' | 'limit',
): number | undefined;
export function parsePaginationValue(
  value: unknown,
  field: 'page' | 'pageSize' | 'limit',
  defaultValue?: number,
): number | undefined {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException(`${field} debe ser un entero positivo.`);
  }
  const text = String(value);
  if (!/^[1-9]\d*$/.test(text)) {
    throw new BadRequestException(`${field} debe ser un entero positivo.`);
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException(`${field} debe ser un entero positivo.`);
  }
  if (field !== 'page' && parsed > MAX_PAGE_SIZE) {
    throw new BadRequestException(`${field} no puede superar ${MAX_PAGE_SIZE}.`);
  }
  return parsed;
}

@Injectable()
export class PaginationQueryPipe implements PipeTransform {
  transform(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('La consulta debe ser un objeto válido.');
    }
    const query = value as Record<string, unknown>;
    return {
      ...query,
      page: parsePaginationValue(query.page, 'page'),
      ...(query.pageSize !== undefined
        ? { pageSize: parsePaginationValue(query.pageSize, 'pageSize') }
        : {}),
      ...(query.limit !== undefined ? { limit: parsePaginationValue(query.limit, 'limit') } : {}),
    };
  }
}
