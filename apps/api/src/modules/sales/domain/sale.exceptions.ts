export class SaleNotFoundException extends Error {
  constructor(identifier: string) {
    super(`Venta con identificador '${identifier}' no fue encontrada.`);
    this.name = 'SaleNotFoundException';
  }
}

export class InsufficientStockException extends Error {
  constructor(productName: string, requestedBaseUnits: number, availableBaseUnits: number) {
    super(
      `Existencias insuficientes para '${productName}'. Se solicitaron ${requestedBaseUnits} unidades base, pero solo hay ${availableBaseUnits} disponibles en lotes activos con vencimiento vigente.`
    );
    this.name = 'InsufficientStockException';
  }
}

export class SaleAlreadyCancelledException extends Error {
  constructor(invoiceNumber: string) {
    super(`La venta con comprobante '${invoiceNumber}' ya se encuentra anulada.`);
    this.name = 'SaleAlreadyCancelledException';
  }
}

export class IdempotencyConflictException extends Error {
  constructor(key: string) {
    super(`Conflicto de idempotencia: La clave '${key}' ya fue procesada con un contenido de solicitud diferente.`);
    this.name = 'IdempotencyConflictException';
  }
}
