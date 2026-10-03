export class InvalidCashAmountException extends Error {
  constructor(amount: number) {
    super(`El monto del movimiento de caja debe ser estrictamente positivo. Recibido: ${amount}`);
    this.name = 'InvalidCashAmountException';
  }
}

export class InvalidCashMovementTypeException extends Error {
  constructor(type: string) {
    super(`El tipo de movimiento de caja "${type}" no es válido`);
    this.name = 'InvalidCashMovementTypeException';
  }
}

export class InvalidCashPaymentMethodException extends Error {
  constructor() {
    super('Caja solo admite movimientos en efectivo. Use Bancos para otros medios de pago.');
    this.name = 'InvalidCashPaymentMethodException';
  }
}

export class InsufficientCashBalanceException extends Error {
  constructor(currentBalance: number, requestedAmount: number) {
    super(
      `Saldo insuficiente en caja de efectivo para realizar el egreso. Saldo disponible: $${currentBalance.toFixed(2)}, Egreso solicitado: $${requestedAmount.toFixed(2)}`
    );
    this.name = 'InsufficientCashBalanceException';
  }
}

export class CashMovementNotFoundException extends Error {
  constructor(id: string) {
    super(`Movimiento de caja con identificador "${id}" no encontrado`);
    this.name = 'CashMovementNotFoundException';
  }
}
