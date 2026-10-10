import { DomainError } from '../../../common/domain-error';

export class SaleNotFoundException extends DomainError {
  constructor(identifier: string) {
    super(`Venta con identificador '${identifier}' no fue encontrada.`, 'not_found');
    this.name = 'SaleNotFoundException';
  }
}

export class InsufficientStockException extends DomainError {
  constructor(productName: string, requestedBaseUnits: number, availableBaseUnits: number) {
    super(
      `Existencias insuficientes para '${productName}'. Se solicitaron ${requestedBaseUnits} unidades base, pero solo hay ${availableBaseUnits} disponibles en lotes activos con vencimiento vigente.`,
      'conflict',
    );
    this.name = 'InsufficientStockException';
  }
}

export class SaleAlreadyCancelledException extends DomainError {
  constructor(invoiceNumber: string) {
    super(`La venta con comprobante '${invoiceNumber}' ya se encuentra anulada.`, 'conflict');
    this.name = 'SaleAlreadyCancelledException';
  }
}

export class SaleHasCreditNotesException extends DomainError {
  constructor(invoiceNumber: string, creditNotesCount: number) {
    super(
      `La venta con comprobante '${invoiceNumber}' tiene ${creditNotesCount} nota(s) crédito asociada(s) y no puede anularse; la anulación reintegraría de nuevo lo ya devuelto.`,
      'conflict',
    );
    this.name = 'SaleHasCreditNotesException';
  }
}

export class SaleHasReceivablePaymentsException extends DomainError {
  constructor(invoiceNumber: string, paymentsCount: number) {
    super(
      `La venta a crédito con comprobante '${invoiceNumber}' tiene ${paymentsCount} abono(s) vigente(s) y no puede anularse; revierta primero los abonos en cartera.`,
      'conflict',
    );
    this.name = 'SaleHasReceivablePaymentsException';
  }
}

export class IdempotencyConflictException extends DomainError {
  constructor(key: string) {
    super(
      `Conflicto de idempotencia: La clave '${key}' ya fue procesada con un contenido de solicitud diferente.`,
      'conflict',
    );
    this.name = 'IdempotencyConflictException';
  }
}
