import { DomainError } from '../../../common/domain-error';

export class PurchaseNotFoundException extends DomainError {
  constructor(id: string) {
    super(`Compra con identificador "${id}" no encontrada`, 'not_found');
    this.name = 'PurchaseNotFoundException';
  }
}

export class SupplierNotActiveException extends DomainError {
  constructor(supplierId: string) {
    super(
      `El proveedor "${supplierId}" se encuentra inactivo y no puede recibir compras`,
      'conflict',
    );
    this.name = 'SupplierNotActiveException';
  }
}

export class ExpiredLotDateException extends DomainError {
  constructor(lotNumber: string, expirationDate: string) {
    super(
      `El lote "${lotNumber}" tiene fecha de vencimiento "${expirationDate}" que es anterior o igual a la fecha actual`,
      'validation',
    );
    this.name = 'ExpiredLotDateException';
  }
}

export class DuplicatePurchaseInvoiceException extends DomainError {
  constructor(invoiceNumber: string) {
    super(`La factura "${invoiceNumber}" de este proveedor ya fue recibida.`, 'conflict');
    this.name = 'DuplicatePurchaseInvoiceException';
  }
}

export class LotConflictException extends DomainError {
  constructor(message: string) {
    super(message, 'conflict');
    this.name = 'LotConflictException';
  }
}
