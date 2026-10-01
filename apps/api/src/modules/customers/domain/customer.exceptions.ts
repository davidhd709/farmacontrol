export class CustomerNotFoundException extends Error {
  constructor(identifier: string) {
    super(`Cliente con identificador '${identifier}' no fue encontrado.`);
    this.name = 'CustomerNotFoundException';
  }
}

export class CustomerAlreadyExistsException extends Error {
  constructor(documentNumber: string) {
    super(`Ya existe un cliente registrado con el número de documento '${documentNumber}'.`);
    this.name = 'CustomerAlreadyExistsException';
  }
}

export class CustomerCannotBeDeactivatedException extends Error {
  constructor(message = 'No se puede inactivar el cliente predeterminado (Consumidor Final).') {
    super(message);
    this.name = 'CustomerCannotBeDeactivatedException';
  }
}

export class CustomerDocumentChangeForbiddenException extends Error {
  constructor() {
    super('Solo un administrador puede cambiar el número de documento de un cliente.');
    this.name = 'CustomerDocumentChangeForbiddenException';
  }
}
