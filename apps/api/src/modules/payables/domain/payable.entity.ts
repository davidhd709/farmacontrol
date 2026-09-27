export type PayableStatus = 'PENDIENTE' | 'PAGADA' | 'ANULADA';

export class Payable {
  constructor(
    public readonly id: string,
    public readonly purchaseId: string,
    public readonly supplierId: string,
    public readonly totalAmount: number,
    public amountPaid: number,
    public balance: number,
    public status: PayableStatus,
    public readonly dueDate: Date,
    public readonly notes: string | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /**
   * Aplica un pago a la cuenta por pagar.
   * RN-AG-01: el monto no puede superar el saldo pendiente.
   */
  applyPayment(amount: number): void {
    if (this.status !== 'PENDIENTE') {
      throw new Error(
        `No se puede pagar una cuenta en estado "${this.status}"`,
      );
    }
    if (amount <= 0) {
      throw new Error('El monto del pago debe ser mayor a cero');
    }
    const roundedAmount = Math.round(amount * 100) / 100;
    const roundedBalance = Math.round(this.balance * 100) / 100;
    if (roundedAmount > roundedBalance) {
      throw new Error(
        `El monto del pago (${roundedAmount}) supera el saldo pendiente (${roundedBalance})`,
      );
    }
    this.amountPaid = Math.round((this.amountPaid + roundedAmount) * 100) / 100;
    this.balance = Math.round((this.totalAmount - this.amountPaid) * 100) / 100;
    if (this.balance <= 0) {
      this.balance = 0;
      this.status = 'PAGADA';
    }
  }
}
