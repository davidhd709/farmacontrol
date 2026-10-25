import { DomainError } from '../../../../common/domain-error';

export class ProductNotFoundException extends DomainError {
  constructor(identifier: string) {
    super(`El producto con identificador "${identifier}" no fue encontrado.`, 'not_found');
    this.name = 'ProductNotFoundException';
  }
}

export class ProductCodeAlreadyExistsException extends DomainError {
  constructor(code: string) {
    super(`Ya existe un producto registrado con el código interno (SKU) "${code}".`, 'conflict');
    this.name = 'ProductCodeAlreadyExistsException';
  }
}

export class ProductBarcodeAlreadyExistsException extends DomainError {
  constructor(barcode: string) {
    super(`Ya existe un producto registrado con el código de barras "${barcode}".`, 'conflict');
    this.name = 'ProductBarcodeAlreadyExistsException';
  }
}

export class ProductCategoryNotFoundException extends DomainError {
  constructor(categoryId: string) {
    super(`La categoría con ID "${categoryId}" no existe o se encuentra inactiva.`, 'not_found');
    this.name = 'ProductCategoryNotFoundException';
  }
}

export class ProductInventoryControlModeException extends DomainError {
  constructor(message: string) {
    super(message, 'validation');
    this.name = 'ProductInventoryControlModeException';
  }
}
