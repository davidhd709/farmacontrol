import { DomainError } from '../domain-error';

export class IdempotencyConflictException extends DomainError {
  constructor(key: string) {
    super(
      `Conflicto de idempotencia: La clave '${key}' ya fue procesada con un contenido de solicitud diferente.`,
      'conflict',
    );
    this.name = 'IdempotencyConflictException';
  }
}
