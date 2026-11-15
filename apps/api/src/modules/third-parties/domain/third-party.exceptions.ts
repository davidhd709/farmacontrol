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

/** El tercero o el cambio pedido está fuera del alcance del usuario (p. ej. cartera y proveedores). */
export class ThirdPartyAccessDeniedException extends DomainError {
  constructor(message: string) {
    super(message, 'forbidden');
    this.name = 'ThirdPartyAccessDeniedException';
  }
}

/**
 * El documento de un cliente o proveedor cambió, pero su tercero también tiene el otro rol:
 * cambiarlo dejaría al otro registro con un documento distinto del tercero que comparten.
 */
export class ThirdPartySharedDocumentChangeException extends DomainError {
  constructor() {
    super(
      'Este tercero es cliente y proveedor a la vez: su número de documento no puede cambiarse desde uno solo de sus roles.',
      'conflict',
    );
    this.name = 'ThirdPartySharedDocumentChangeException';
  }
}
