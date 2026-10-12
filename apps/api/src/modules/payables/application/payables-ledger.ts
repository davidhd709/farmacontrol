import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@farmacia/database';
import { centsToMoneyString, parseMoneyToCents } from '../../treasury/domain/treasury-rules';

type Tx = Prisma.TransactionClient;

/**
 * Contrato transaccional de cuentas por pagar para otros módulos: compras abre y
 * ajusta obligaciones con proveedores sólo a través de estos métodos, dentro de su transacción.
 */
@Injectable()
export class PayablesLedger {
  /** Toda compra causa una obligación PENDIENTE; si es de contado vence en la fecha de compra. */
  async openForPurchase(
    tx: Tx,
    params: {
      purchaseId: string;
      supplierId: string;
      totalAmount: Prisma.Decimal.Value;
      dueDate: Date;
      notes: string | null | undefined;
    },
  ): Promise<void> {
    await tx.payable.create({
      data: {
        purchaseId: params.purchaseId,
        supplierId: params.supplierId,
        totalAmount: new Prisma.Decimal(params.totalAmount),
        amountPaid: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(params.totalAmount),
        status: 'PENDIENTE',
        dueDate: params.dueDate,
        notes: params.notes,
      },
    });
  }

  /**
   * Reduce lo adeudado por una nota débito: total y saldo bajan juntos y lo pagado no
   * cambia. Bloquea la fila y rechaza la nota si supera el saldo pendiente.
   */
  async applyDebitNote(
    tx: Tx,
    params: {
      purchaseId: string;
      invoiceNumber: string;
      debitNoteNumber: string;
      amountCents: bigint;
    },
  ): Promise<void> {
    const payables = await tx.$queryRaw<
      Array<{
        id: string;
        total_amount: Prisma.Decimal;
        balance: Prisma.Decimal;
        status: string;
        notes: string | null;
      }>
    >`
      SELECT id, total_amount, balance, status, notes
      FROM payables
      WHERE purchase_id = ${params.purchaseId}::uuid
      FOR UPDATE
    `;
    if (!payables.length) {
      throw new BadRequestException(
        `La compra ${params.invoiceNumber} no tiene cuenta por pagar asociada.`,
      );
    }
    const payable = payables[0];
    const balanceCents = parseMoneyToCents(payable.balance.toString(), 'Saldo por pagar');
    if (params.amountCents > balanceCents) {
      // El asiento debita Proveedores por el total: recortar el saldo descuadraría la cartera
      throw new ConflictException(
        `La devolución (${centsToMoneyString(params.amountCents)}) supera el saldo pendiente de la cuenta por pagar (${centsToMoneyString(balanceCents)}).`,
      );
    }
    const newTotalCents =
      parseMoneyToCents(payable.total_amount.toString(), 'Total por pagar') - params.amountCents;
    const newBalanceCents = balanceCents - params.amountCents;

    await tx.payable.update({
      where: { id: payable.id },
      data: {
        totalAmount: new Prisma.Decimal(centsToMoneyString(newTotalCents)),
        balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
        status: newBalanceCents === 0n ? 'PAGADA' : payable.status,
        notes:
          `${payable.notes || ''} [Nota Débito ${params.debitNoteNumber}: -${centsToMoneyString(params.amountCents)}]`.trim(),
      },
    });
  }
}
