import { DomainError, type DomainErrorKind } from '../../../../common/domain-error';

export class InventoryDomainException extends DomainError {
  constructor(message: string, kind: DomainErrorKind = 'validation') {
    super(message, kind);
    this.name = 'InventoryDomainException';
  }
}

export class InvalidLotDataException extends InventoryDomainException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLotDataException';
  }
}

export class NegativeQuantityException extends InventoryDomainException {
  constructor(message: string = 'La cantidad de inventario en unidad base no puede ser negativa.') {
    super(message);
    this.name = 'NegativeQuantityException';
  }
}

export class LotExpiredException extends InventoryDomainException {
  constructor(message: string = 'El lote se encuentra vencido.') {
    super(message, 'conflict');
    this.name = 'LotExpiredException';
  }
}

export class InsufficientInventoryException extends InventoryDomainException {
  constructor(
    message: string = 'No hay suficiente inventario disponible para satisfacer la cantidad solicitada.',
  ) {
    super(message, 'conflict');
    this.name = 'InsufficientInventoryException';
  }
}

/** FARM-AUD-004: el lote indicado pertenece a otro producto; el ajuste no toca existencias. */
export class LotProductMismatchException extends InventoryDomainException {
  constructor(lotNumber: string) {
    super(`El lote '${lotNumber}' no pertenece al producto indicado.`);
    this.name = 'LotProductMismatchException';
  }
}

/**
 * ADR-005: no se asume costo cero. Un producto con existencias sin compras ni costo de
 * catálogo no puede valorizarse hasta que se registre su costo.
 */
export class InventoryCostUnavailableException extends InventoryDomainException {
  constructor(productName: string) {
    super(
      `El producto '${productName}' tiene existencias sin costo conocido: no tiene compras registradas y su costo en el catálogo es cero. Registre su costo en el catálogo o recíbalo mediante una compra antes de moverlo.`,
      'conflict',
    );
    this.name = 'InventoryCostUnavailableException';
  }
}

/** Las existencias de los lotes y el inventario valorizado deben coincidir siempre. */
export class InventoryValuationMismatchException extends InventoryDomainException {
  constructor(productName: string, physical: number, valued: number) {
    super(
      `Las existencias de '${productName}' (${physical} unidades base en lotes) no coinciden con el inventario valorizado (${valued}). La operación se detuvo; revise los movimientos del producto.`,
      'conflict',
    );
    this.name = 'InventoryValuationMismatchException';
  }
}
