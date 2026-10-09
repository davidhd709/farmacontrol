export class PurchaseNotFoundException extends Error {
  constructor(id: string) {
    super(`Compra con identificador "${id}" no encontrada`);
    this.name = 'PurchaseNotFoundException';
  }
}

export class SupplierNotActiveException extends Error {
  constructor(supplierId: string) {
    super(`El proveedor "${supplierId}" se encuentra inactivo y no puede recibir compras`);
    this.name = 'SupplierNotActiveException';
  }
}

export class ExpiredLotDateException extends Error {
  constructor(lotNumber: string, expirationDate: string) {
    super(
      `El lote "${lotNumber}" tiene fecha de vencimiento "${expirationDate}" que es anterior o igual a la fecha actual`
    );
    this.name = 'ExpiredLotDateException';
  }
}

export class DuplicatePurchaseInvoiceException extends Error {
  constructor(invoiceNumber: string) {
    super(`La factura "${invoiceNumber}" de este proveedor ya fue recibida.`);
    this.name = 'DuplicatePurchaseInvoiceException';
  }
}

export class LotConflictException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LotConflictException';
  }
}
