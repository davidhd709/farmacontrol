import { DomainError } from '../../../common/domain-error';

export class InvalidCashAmountException extends DomainError {
  constructor(amount?: number | string) {
    super(
      amount !== undefined
        ? `El monto del movimiento de caja debe ser estrictamente positivo. Recibido: ${amount}`
        : 'El monto del movimiento de caja debe ser estrictamente positivo.',
      'validation',
    );
    this.name = 'InvalidCashAmountException';
  }
}

export class InvalidCashMovementTypeException extends DomainError {
  constructor(type?: string) {
    super(
      type !== undefined
        ? `El tipo de movimiento de caja "${type}" no es válido`
        : 'El tipo de movimiento de caja no es válido',
      'validation',
    );
    this.name = 'InvalidCashMovementTypeException';
  }
}

export class InvalidCashPaymentMethodException extends DomainError {
  constructor() {
    super(
      'Caja solo admite movimientos en efectivo. Use Bancos para otros medios de pago.',
      'validation',
    );
    this.name = 'InvalidCashPaymentMethodException';
  }
}

export class InsufficientCashBalanceException extends DomainError {
  constructor(currentBalance: number, requestedAmount: number) {
    super(
      `Saldo insuficiente en caja de efectivo para realizar el egreso. Saldo disponible: $${currentBalance.toFixed(2)}, Egreso solicitado: $${requestedAmount.toFixed(2)}`,
      'conflict',
    );
    this.name = 'InsufficientCashBalanceException';
  }
}

export class CashMovementNotFoundException extends DomainError {
  constructor(id: string) {
    super(`Movimiento de caja con identificador "${id}" no encontrado`, 'not_found');
    this.name = 'CashMovementNotFoundException';
  }
}
