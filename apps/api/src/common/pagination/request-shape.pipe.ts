import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export type FieldRule =
  | 'filename'
  | 'text'
  | 'text?'
  | 'uuid'
  | 'uuid?'
  | 'date'
  | 'date?'
  | 'boolean'
  | 'boolean?'
  | 'booleanString'
  | 'booleanString?'
  | 'integerString'
  | 'integerString?'
  | 'integer'
  | 'integer?'
  | 'number'
  | 'number?'
  | 'decimal'
  | 'decimal?'
  | 'stringArray'
  | 'stringArray?'
  | 'object'
  | 'object?'
  | { values: readonly string[]; optional?: boolean }
  | { arrayOf: Shape; optional?: boolean };
export type Shape = Record<string, FieldRule>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Fecha calendario (YYYY-MM-DD) o fecha-hora ISO 8601: los clientes envían ambas.
const datePattern =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const decimalPattern = /^-?\d+(?:\.\d+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateShape(value: unknown, shape: Shape, path: string): void {
  if (!isRecord(value)) throw new BadRequestException(`${path} debe ser un objeto JSON.`);
  for (const [name, rule] of Object.entries(shape)) {
    const item = value[name];
    const optional = typeof rule === 'string' ? rule.endsWith('?') : rule.optional === true;
    if (item === undefined || item === null) {
      if (!optional) throw new BadRequestException(`${path}.${name} es obligatorio.`);
      continue;
    }
    const kind = typeof rule === 'string' ? rule.replace(/\?$/, '') : rule;
    let valid = false;
    if (typeof kind === 'object') {
      if ('values' in kind) valid = typeof item === 'string' && kind.values.includes(item);
      else {
        valid = Array.isArray(item);
        if (Array.isArray(item))
          item.forEach((entry: unknown, index: number) =>
            validateShape(entry, kind.arrayOf, `${path}.${name}[${index}]`),
          );
      }
    } else if (kind === 'filename')
      valid =
        typeof item === 'string' && /^[a-zA-Z0-9_.-]+\.dump$/.test(item) && !item.includes('..');
    else if (kind === 'text')
      valid = typeof item === 'string' && (optional || item.trim().length > 0);
    else if (kind === 'uuid') valid = typeof item === 'string' && uuidPattern.test(item);
    else if (kind === 'date')
      valid = typeof item === 'string' && datePattern.test(item) && !Number.isNaN(Date.parse(item));
    else if (kind === 'boolean') valid = typeof item === 'boolean';
    else if (kind === 'booleanString')
      valid = typeof item === 'string' && ['true', 'false', '1', '0'].includes(item);
    else if (kind === 'integerString') valid = typeof item === 'string' && /^\d+$/.test(item);
    else if (kind === 'integer') valid = typeof item === 'number' && Number.isSafeInteger(item);
    else if (kind === 'number') valid = typeof item === 'number' && Number.isFinite(item);
    else if (kind === 'decimal')
      valid =
        (typeof item === 'number' && Number.isFinite(item)) ||
        (typeof item === 'string' && decimalPattern.test(item));
    else if (kind === 'stringArray')
      valid = Array.isArray(item) && item.every((entry) => typeof entry === 'string');
    else if (kind === 'object') valid = isRecord(item);
    if (!valid) throw new BadRequestException(`${path}.${name} tiene un formato inválido.`);
  }
}

@Injectable()
export class RequestShapeValidationPipe implements PipeTransform {
  constructor(private readonly shape: Shape) {}
  transform(value: unknown): unknown {
    validateShape(value, this.shape, 'body');
    return value;
  }
}

@Injectable()
export class RequestFieldValidationPipe implements PipeTransform {
  constructor(
    private readonly field: string,
    private readonly rule: FieldRule,
  ) {}
  transform(value: unknown): unknown {
    validateShape({ [this.field]: value }, { [this.field]: this.rule }, 'body');
    return value;
  }
}

@Injectable()
export class QueryFieldValidationPipe implements PipeTransform {
  constructor(
    private readonly field: string,
    private readonly rule: FieldRule,
  ) {}
  transform(value: unknown): unknown {
    validateShape({ [this.field]: value }, { [this.field]: this.rule }, 'query');
    return value;
  }
}

@Injectable()
export class QueryShapeValidationPipe implements PipeTransform {
  constructor(private readonly shape: Shape) {}
  transform(value: unknown): unknown {
    validateShape(value ?? {}, this.shape, 'query');
    return value ?? {};
  }
}

@Injectable()
export class ParamFieldValidationPipe implements PipeTransform {
  constructor(
    private readonly field: string,
    private readonly rule: FieldRule,
  ) {}
  transform(value: unknown): unknown {
    validateShape({ [this.field]: value }, { [this.field]: this.rule }, 'param');
    return value;
  }
}
