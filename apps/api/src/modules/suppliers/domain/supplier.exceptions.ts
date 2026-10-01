export class SupplierNotFoundException extends Error {
  constructor(identifier: string) {
    super(`Proveedor con identificador "${identifier}" no encontrado`);
    this.name = 'SupplierNotFoundException';
  }
}

export class SupplierAlreadyExistsException extends Error {
  constructor(taxId: string) {
    super(`Ya existe un proveedor registrado con el NIT/identificación "${taxId}"`);
    this.name = 'SupplierAlreadyExistsException';
  }
}

export class SupplierTaxIdChangeForbiddenException extends Error {
  constructor() {
    super('Solo un administrador puede cambiar el NIT/identificación de un proveedor.');
    this.name = 'SupplierTaxIdChangeForbiddenException';
  }
}
