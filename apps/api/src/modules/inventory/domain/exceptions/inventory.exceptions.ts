export class InventoryDomainException extends Error {
  constructor(message: string) {
    super(message);
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
    super(message);
    this.name = 'LotExpiredException';
  }
}

export class InsufficientInventoryException extends InventoryDomainException {
  constructor(message: string = 'No hay suficiente inventario disponible para satisfacer la cantidad solicitada.') {
    super(message);
    this.name = 'InsufficientInventoryException';
  }
}
