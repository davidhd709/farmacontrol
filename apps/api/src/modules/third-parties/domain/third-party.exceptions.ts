import { DomainError } from '../../../common/domain-error';

export class ThirdPartyNotFoundException extends DomainError {
  constructor(id: string) {
    super(`El tercero con identificador '${id}' no existe en el sistema.`, 'not_found');
    this.name = 'ThirdPartyNotFoundException';
  }
}

export class ThirdPartyAlreadyExistsException extends DomainError {
  constructor(documentNumber: string) {
    super(
      `Ya existe un tercero registrado con el número de documento '${documentNumber}'.`,
      'conflict',
    );
    this.name = 'ThirdPartyAlreadyExistsException';
  }
}

export class ThirdPartyDocumentChangeForbiddenException extends DomainError {
  constructor() {
    super(
      'No está permitido modificar el número de documento del tercero una vez creado.',
      'forbidden',
    );
    this.name = 'ThirdPartyDocumentChangeForbiddenException';
  }
}
