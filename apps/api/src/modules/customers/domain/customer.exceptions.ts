import { DomainError } from '../../../common/domain-error';

export class CustomerNotFoundException extends DomainError {
  constructor(identifier: string) {
    super(`Cliente con identificador '${identifier}' no fue encontrado.`, 'not_found');
    this.name = 'CustomerNotFoundException';
  }
}

export class CustomerAlreadyExistsException extends DomainError {
  constructor(documentNumber: string) {
    super(
      `Ya existe un cliente registrado con el número de documento '${documentNumber}'.`,
      'conflict',
    );
    this.name = 'CustomerAlreadyExistsException';
  }
}

export class CustomerCannotBeDeactivatedException extends DomainError {
  constructor(message = 'No se puede inactivar el cliente predeterminado (Consumidor Final).') {
    super(message, 'validation');
    this.name = 'CustomerCannotBeDeactivatedException';
  }
}

export class CustomerDocumentChangeForbiddenException extends DomainError {
  constructor() {
    super('Solo un administrador puede cambiar el número de documento de un cliente.', 'forbidden');
    this.name = 'CustomerDocumentChangeForbiddenException';
  }
}
