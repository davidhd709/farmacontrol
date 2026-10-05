export class ThirdPartyNotFoundException extends Error {
  constructor(id: string) {
    super(`El tercero con identificador '${id}' no existe en el sistema.`);
    this.name = 'ThirdPartyNotFoundException';
  }
}

export class ThirdPartyAlreadyExistsException extends Error {
  constructor(documentNumber: string) {
    super(`Ya existe un tercero registrado con el número de documento '${documentNumber}'.`);
    this.name = 'ThirdPartyAlreadyExistsException';
  }
}

export class ThirdPartyDocumentChangeForbiddenException extends Error {
  constructor() {
    super('No está permitido modificar el número de documento del tercero una vez creado.');
    this.name = 'ThirdPartyDocumentChangeForbiddenException';
  }
}
