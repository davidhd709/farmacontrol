export type ReceivableStatus = 'PENDIENTE' | 'PAGADA' | 'ANULADA';

export class Receivable {
  constructor(
    public readonly id: string,
    public readonly saleId: string,
    public readonly customerId: string,
    public readonly totalAmount: number,
    public amountPaid: number,
    public balance: number,
    public status: ReceivableStatus,
    public readonly dueDate: Date,
    public readonly notes: string | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /**
   * Aplica un abono a la cuenta por cobrar.
   * Regla RN-AG-01: el saldo no puede ser negativo;
   * la suma de abonos no puede superar el valor total.
   */
  applyPayment(amount: number): void {
    if (this.status !== 'PENDIENTE') {
      throw new Error(
        `No se puede abonar a una cuenta en estado "${this.status}"`,
      );
    }
    if (amount <= 0) {
      throw new Error('El monto del abono debe ser mayor a cero');
    }
    // Comparar con precisión: redondear a 2 decimales
    const roundedAmount = Math.round(amount * 100) / 100;
    const roundedBalance = Math.round(this.balance * 100) / 100;
    if (roundedAmount > roundedBalance) {
      throw new Error(
        `El monto del abono (${roundedAmount}) supera el saldo pendiente (${roundedBalance})`,
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
