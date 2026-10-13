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

/**
 * FARM-AUD-002: mientras no exista un modelo de inventario sin lote (T-09), todo producto se
 * controla por lote para que sus ventas descuenten existencias y dejen kardex.
 */
export class ProductLotControlRequiredException extends DomainError {
  constructor() {
    super(
      'El control por lote y vencimiento es obligatorio: un producto sin control de lote podría venderse sin descontar inventario. El inventario sin lote aún no está disponible.',
      'validation',
    );
    this.name = 'ProductLotControlRequiredException';
  }
}
