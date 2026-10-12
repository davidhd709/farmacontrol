import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@farmacia/database';
import { centsToMoneyString, parseMoneyToCents } from '../../treasury/domain/treasury-rules';

type Tx = Prisma.TransactionClient;

function toCents(value: Prisma.Decimal | string | number, label: string): bigint {
  return parseMoneyToCents(new Prisma.Decimal(value).toFixed(2), label);
}

/**
 * Contrato transaccional de cartera para otros módulos: ventas abre, anula y
 * ajusta cuentas por cobrar sólo a través de estos métodos, dentro de su transacción.
 */
@Injectable()
export class ReceivablesLedger {
  /** Abre la cuenta por cobrar de una venta a crédito. */
  async openForSale(
    tx: Tx,
    params: { saleId: string; customerId: string; total: string; dueDate: Date; notes: string },
  ): Promise<void> {
    await tx.receivable.create({
      data: {
        saleId: params.saleId,
        customerId: params.customerId,
        totalAmount: params.total,
        amountPaid: '0.00',
        balance: params.total,
        status: 'PENDIENTE',
        dueDate: params.dueDate,
        notes: params.notes,
      },
    });
  }

  /** Marca como CANCELADA la cuenta por cobrar de una venta anulada. */
  async cancelForSale(tx: Tx, saleId: string, reason: string): Promise<void> {
    await tx.receivable.updateMany({
      where: { saleId },
      data: { status: 'CANCELADA', notes: `Venta anulada: ${reason}` },
    });
  }

  /**
   * Reduce lo adeudado por una nota crédito: total y saldo bajan juntos y lo abonado no
   * cambia. Bloquea la fila y rechaza la nota si supera el saldo pendiente.
   */
  async applyCreditNote(
    tx: Tx,
    params: {
      saleId: string;
      invoiceNumber: string;
      creditNoteNumber: string;
      amountCents: bigint;
    },
  ): Promise<void> {
    const receivables = await tx.$queryRaw<
      Array<{
        id: string;
        total_amount: Prisma.Decimal;
        balance: Prisma.Decimal;
        status: string;
        notes: string | null;
      }>
    >`
      SELECT id, total_amount, balance, status, notes
      FROM receivables
      WHERE sale_id = ${params.saleId}::uuid
      FOR UPDATE
    `;
    if (!receivables.length) {
      throw new BadRequestException(
        `La venta ${params.invoiceNumber} no tiene cuenta por cobrar asociada.`,
      );
    }
    const receivable = receivables[0];
    if (receivable.status === 'CANCELADA') {
      throw new ConflictException(
        `La cuenta por cobrar de la venta ${params.invoiceNumber} está CANCELADA.`,
      );
    }
    const balanceCents = toCents(receivable.balance, 'Saldo de cartera');
    if (params.amountCents > balanceCents) {
      throw new ConflictException(
        `La devolución (${centsToMoneyString(params.amountCents)}) supera el saldo pendiente en cartera (${centsToMoneyString(balanceCents)}).`,
      );
    }
    const newTotalCents = toCents(receivable.total_amount, 'Total de cartera') - params.amountCents;
    const newBalanceCents = balanceCents - params.amountCents;
    await tx.receivable.update({
      where: { id: receivable.id },
      data: {
        totalAmount: new Prisma.Decimal(centsToMoneyString(newTotalCents)),
        balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
        status: newBalanceCents === 0n ? 'PAGADA' : receivable.status,
        notes:
          `${receivable.notes || ''} [Nota Crédito ${params.creditNoteNumber}: -${centsToMoneyString(params.amountCents)}]`.trim(),
      },
    });
  }
}
