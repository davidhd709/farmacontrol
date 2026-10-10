import { DomainError } from '../../../common/domain-error';

export class SupplierNotFoundException extends DomainError {
  constructor(identifier: string) {
    super(`Proveedor con identificador "${identifier}" no encontrado`, 'not_found');
    this.name = 'SupplierNotFoundException';
  }
}

export class SupplierAlreadyExistsException extends DomainError {
  constructor(taxId: string) {
    super(`Ya existe un proveedor registrado con el NIT/identificación "${taxId}"`, 'conflict');
    this.name = 'SupplierAlreadyExistsException';
  }
}

export class SupplierTaxIdChangeForbiddenException extends DomainError {
  constructor() {
    super(
      'Solo un administrador puede cambiar el NIT/identificación de un proveedor.',
      'forbidden',
    );
    this.name = 'SupplierTaxIdChangeForbiddenException';
  }
}
