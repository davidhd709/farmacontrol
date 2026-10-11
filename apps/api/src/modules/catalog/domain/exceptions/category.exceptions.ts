import { DomainError } from '../../../../common/domain-error';

export class CategoryNotFoundException extends DomainError {
  constructor(identifier: string) {
    super(`No se encontró la categoría con identificador: ${identifier}`, 'not_found');
    this.name = 'CategoryNotFoundException';
  }
}

export class CategoryAlreadyExistsException extends DomainError {
  constructor(name: string) {
    super(`Ya existe una categoría registrada con el nombre: "${name}".`, 'conflict');
    this.name = 'CategoryAlreadyExistsException';
  }
}

export class CategoryHasActiveProductsException extends DomainError {
  constructor(name: string) {
    super(
      `No se puede inactivar la categoría "${name}" porque tiene productos activos asociados.`,
      'conflict',
    );
    this.name = 'CategoryHasActiveProductsException';
  }
}
