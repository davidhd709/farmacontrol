import {
  businessDayStart,
  businessDayEnd,
  businessToday,
  calendarDate,
} from '../../../common/utils/business-date';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import { CashService } from '../../cash/application/cash.service';
import {
  ReceivableDto,
  ReceivableQueryFilters,
  PaginatedResponse,
  AgingBreakdownDto,
  ReceivableStatus,
  ReceivableMovementsDto,
} from '@farmacia/contracts';
import { buildDocumentMovements, RawDocumentMovement } from '../../../common/utils/document-movements';
import { centsToMoneyString, parseMoneyToCents } from '../../treasury/domain/treasury-rules';
import { recordSourceBankMovement } from '../../treasury/application/record-source-bank-movement';
import { agingBreakdown, agingBucketOf, daysOverdue } from '../../../common/utils/aging';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly cashService: CashService,
    private readonly accountingEngine: AccountingEngineService,
    private readonly idempotencyService: IdempotencyService = new IdempotencyService(),
  ) {}

  // ------------------------------------------------------------------ //
  //  Mapping
  // ------------------------------------------------------------------ //

  private toDto(row: any, payments?: any[]): ReceivableDto {
    return {
      id: row.id,
      saleId: row.saleId,
      customerId: row.customerId,
      customerName: row.customer?.name ?? undefined,
      invoiceNumber: row.sale?.invoiceNumber ?? undefined,
      totalAmount: row.totalAmount.toString(),
      amountPaid: row.amountPaid.toString(),
      balance: row.balance.toString(),
      status: row.status,
      dueDate:
        row.dueDate instanceof Date
          ? row.dueDate.toISOString().split('T')[0]
          : String(row.dueDate).split('T')[0],
      notes: row.notes ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
      payments: payments?.map((p) => ({
        id: p.id,
        receivableId: p.receivableId,
        amount: p.amount.toString(),
        paymentMethod: p.paymentMethod,
        bankAccountId: p.bankAccountId ?? null,
        notes: p.notes ?? null,
        createdByUserId: p.createdByUserId,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
        isReversed: Boolean(p.isReversed),
        reversedAt:
          p.reversedAt instanceof Date ? p.reversedAt.toISOString() : (p.reversedAt ?? null),
        reversalReason: p.reversalReason ?? null,
      })),
    };
  }

  // ------------------------------------------------------------------ //
  //  Queries
  // ------------------------------------------------------------------ //

  async findAll(filters: ReceivableQueryFilters): Promise<PaginatedResponse<ReceivableDto>> {
    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.min(filters.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status;
    if (filters.overdueOnly) {
      where.dueDate = { lt: calendarDate(businessToday()) };
      where.status = 'PENDIENTE';
    }
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = businessDayStart(filters.fromDate);
      if (filters.toDate) {
        where.createdAt.lte = businessDayEnd(filters.toDate);
      }
    }

    const [items, total] = await prisma.$transaction([
      prisma.receivable.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { dueDate: 'asc' },
        include: {
          customer: { select: { name: true } },
          sale: { select: { invoiceNumber: true } },
        },
      }),
      prisma.receivable.count({ where }),
    ]);

    return {
      items: items.map((r: any) => this.toDto(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findById(id: string): Promise<ReceivableDto> {
    const row = await prisma.receivable.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        sale: { select: { invoiceNumber: true } },
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) {
      throw new NotFoundException(`Cuenta por cobrar "${id}" no encontrada`);
    }
    return this.toDto(row, row.payments);
  }

  /**
   * Estado de una factura en cartera: el cargo de la venta a crédito, cada abono con su
   * recibo de caja, las reversiones, las notas crédito que la redujeron y el saldo después de
   * cada movimiento ("Ver abonos").
   */
  async getMovements(id: string): Promise<ReceivableMovementsDto> {
    const row = await prisma.receivable.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        sale: {
          select: {
            invoiceNumber: true,
            createdAt: true,
            creditNotes: {
              where: { refundMethod: 'CREDITO_CARTERA' },
              select: { creditNoteNumber: true, total: true, reason: true, createdAt: true },
            },
          },
        },
        payments: { include: { treasuryDocument: { select: { documentNumber: true } } } },
      },
    });
    if (!row) {
      throw new NotFoundException(`Cuenta por cobrar "${id}" no encontrada`);
    }
    const toCents = (value: Prisma.Decimal) => parseMoneyToCents(value.toFixed(2), 'Valor');
    const notes = row.sale?.creditNotes ?? [];
    // La nota crédito a cartera baja el total y el saldo: el cargo original es la suma de ambos
    const originalCents =
      toCents(row.totalAmount) + notes.reduce((acc, n) => acc + toCents(n.total), 0n);
    const raw: RawDocumentMovement[] = [
      {
        at: row.sale?.createdAt ?? row.createdAt,
        type: 'CARGO',
        documentNumber: row.sale?.invoiceNumber ?? null,
        description: 'Venta a crédito',
        deltaCents: originalCents,
      },
    ];
    for (const payment of row.payments) {
      raw.push({
        at: payment.createdAt,
        type: 'ABONO',
        documentNumber: payment.treasuryDocument?.documentNumber ?? null,
        description: payment.notes || 'Abono del cliente',
        paymentMethod: payment.paymentMethod,
        paymentId: payment.id,
        isReversed: payment.isReversed,
        deltaCents: -toCents(payment.amount),
      });
      if (payment.isReversed && payment.reversedAt) {
        raw.push({
          at: payment.reversedAt,
          type: 'REVERSION_ABONO',
          documentNumber: null,
          description: `Reversión del abono: ${payment.reversalReason ?? ''}`.trim(),
          paymentMethod: payment.paymentMethod,
          deltaCents: toCents(payment.amount),
        });
      }
    }
    for (const note of notes) {
      raw.push({
        at: note.createdAt,
        type: 'NOTA_CREDITO',
        documentNumber: note.creditNoteNumber,
        description: `Devolución: ${note.reason}`,
        deltaCents: -toCents(note.total),
      });
    }
    // La anulación de la venta cancela lo que quedaba pendiente
    const pendingCents = raw.reduce((acc, m) => acc + m.deltaCents, 0n);
    if (row.status === 'ANULADA' && pendingCents > 0n) {
      raw.push({
        at: row.updatedAt,
        type: 'ANULACION',
        documentNumber: row.sale?.invoiceNumber ?? null,
        description: row.notes ?? 'Venta anulada',
        deltaCents: -pendingCents,
      });
    }
    const movements = buildDocumentMovements(raw);
    return {
      receivableId: row.id,
      invoiceNumber: row.sale?.invoiceNumber ?? null,
      customerName: row.customer?.name ?? null,
      totalAmount: row.totalAmount.toFixed(2),
      amountPaid: row.amountPaid.toFixed(2),
      balance: row.balance.toFixed(2),
      status: row.status as ReceivableStatus,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      movements,
    };
  }

  // ------------------------------------------------------------------ //
  //  Commands
  // ------------------------------------------------------------------ //

  /**
   * Aplica un abono a una factura en cartera dentro de la transacción del llamador: bloquea la
   * cuenta, valida estado, saldo y cliente, actualiza saldos, registra el abono y su asiento.
   * El movimiento de dinero lo registra el documento que respalda el abono (recibo de caja).
   */
  async applyPaymentInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      receivableId: string;
      amountCents: bigint;
      paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA';
      bankAccountId: string | null;
      notes: string | null;
      userId: string;
      treasuryDocumentId?: string;
      /** Cliente del recibo: la factura debe ser suya */
      expectedCustomerId?: string;
    },
  ): Promise<{ paymentId: string; invoiceNumber: string | null; customerName: string | null }> {
    if (input.amountCents <= 0n) {
      throw new BadRequestException('El monto del abono debe ser mayor a cero');
    }
    // Bloqueo pesimista para evitar doble abono concurrente
    const rows = await tx.$queryRaw<
      Array<{ customerId: string; amountPaid: Prisma.Decimal; balance: Prisma.Decimal; status: string }>
    >`
      SELECT customer_id AS "customerId", amount_paid AS "amountPaid", balance, status
      FROM receivables
      WHERE id = ${input.receivableId}::uuid
      FOR UPDATE
    `;
    if (!rows.length) {
      throw new NotFoundException(`Cuenta por cobrar "${input.receivableId}" no encontrada`);
    }
    const raw = rows[0];
    if (input.expectedCustomerId && raw.customerId !== input.expectedCustomerId) {
      throw new BadRequestException('La factura seleccionada no pertenece al cliente del recibo.');
    }
    if (raw.status !== 'PENDIENTE') {
      throw new BadRequestException(`No se puede abonar a una cuenta en estado "${raw.status}"`);
    }
    const balanceCents = parseMoneyToCents(raw.balance.toString(), 'Saldo pendiente');
    if (input.amountCents > balanceCents) {
      throw new BadRequestException('El monto del abono supera el saldo pendiente.');
    }
    const amountPaidCents = parseMoneyToCents(raw.amountPaid.toString(), 'Total abonado');
    const newBalanceCents = balanceCents - input.amountCents;
    const amount = centsToMoneyString(input.amountCents);

    const updated = await tx.receivable.update({
      where: { id: input.receivableId },
      data: {
        amountPaid: new Prisma.Decimal(centsToMoneyString(amountPaidCents + input.amountCents)),
        balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
        status: (newBalanceCents === 0n ? 'PAGADA' : 'PENDIENTE') satisfies ReceivableStatus,
      },
      include: {
        customer: { select: { name: true } },
        sale: { select: { invoiceNumber: true } },
      },
    });
    const payment = await tx.receivablePayment.create({
      data: {
        receivableId: input.receivableId,
        amount: new Prisma.Decimal(amount),
        paymentMethod: input.paymentMethod,
        bankAccountId: input.paymentMethod === 'TRANSFERENCIA' ? input.bankAccountId : null,
        notes: input.notes,
        createdByUserId: input.userId,
        treasuryDocumentId: input.treasuryDocumentId ?? null,
      },
    });
    await this.accountingEngine.handleCustomerPayment(
      {
        id: payment.id,
        receivableId: input.receivableId,
        amount: payment.amount,
        paymentMethod: input.paymentMethod,
        bankAccountId: input.paymentMethod === 'TRANSFERENCIA' ? input.bankAccountId : null,
        createdByUserId: input.userId,
        customerName: updated.customer?.name,
        invoiceNumber: updated.sale?.invoiceNumber,
      },
      tx,
    );
    return {
      paymentId: payment.id,
      invoiceNumber: updated.sale?.invoiceNumber ?? null,
      customerName: updated.customer?.name ?? null,
    };
  }

  /**
   * Resumen por edades de las facturas pendientes: Corriente (no vencida o hasta 30 días),
   * 31–60, 61–90 y más de 90 días vencida (los mismos rangos en cartera y cuentas por pagar).
   */
  async getAgingSummary(): Promise<AgingBreakdownDto> {
    const rows = await prisma.receivable.findMany({
      where: { status: 'PENDIENTE', balance: { gt: 0 } },
      select: { balance: true, dueDate: true },
    });
    const today = calendarDate(businessToday());
    return agingBreakdown(
      rows.map((row) => ({
        balanceCents: parseMoneyToCents(row.balance.toString(), 'Saldo de cartera'),
        bucket: agingBucketOf(daysOverdue(row.dueDate, today)),
      })),
    );
  }

  /**
   * Reversión controlada de un abono de cliente con restitución de saldo y contrasentido financiero.
   */
  async revertPayment(
    receivableId: string,
    paymentId: string,
    reason: string,
    userId: string,
  ): Promise<ReceivableDto> {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new BadRequestException('El motivo de la reversión es obligatorio.');
    }

    return prisma.$transaction(
      async (tx: any) => {
        // 1. Bloqueo pesimista del receivable
        const rows = await tx.$queryRaw<any[]>`
        SELECT
          id,
          sale_id    AS "saleId",
          customer_id AS "customerId",
          total_amount AS "totalAmount",
          amount_paid  AS "amountPaid",
          balance,
          status,
          due_date    AS "dueDate",
          notes
        FROM receivables
        WHERE id = ${receivableId}::uuid
        FOR UPDATE
      `;

        if (!rows.length) {
          throw new NotFoundException(`Cuenta por cobrar "${receivableId}" no encontrada`);
        }

        const raw = rows[0];

        // Una cuenta de una venta anulada no debe volver a quedar pendiente de cobro
        if (raw.status === ('ANULADA' satisfies ReceivableStatus)) {
          throw new ConflictException(
            'No se puede revertir un abono de una cuenta por cobrar ANULADA.',
          );
        }

        // 2. Buscar el abono a revertir
        const payment = await tx.receivablePayment.findUnique({
          where: { id: paymentId },
        });

        if (!payment || payment.receivableId !== receivableId) {
          throw new NotFoundException(
            `Abono "${paymentId}" no encontrado en esta cuenta por cobrar`,
          );
        }

        if (payment.isReversed) {
          throw new BadRequestException('Este abono ya fue revertido previamente.');
        }

        const paymentAmountCents = parseMoneyToCents(
          payment.amount.toString(),
          'Monto del abono a revertir',
        );
        const balanceCents = parseMoneyToCents(raw.balance.toString(), 'Saldo pendiente');
        const amountPaidCents = parseMoneyToCents(raw.amountPaid.toString(), 'Total abonado');

        const newBalanceCents = balanceCents + paymentAmountCents;
        const newAmountPaidCents = amountPaidCents - paymentAmountCents;

        if (newAmountPaidCents < 0n) {
          throw new BadRequestException('El monto del reverso excede el total abonado registrado.');
        }

        // 3. Marcar abono como revertido
        await tx.receivablePayment.update({
          where: { id: paymentId },
          data: {
            isReversed: true,
            reversedAt: new Date(),
            reversalReason: trimmedReason,
            reversedByUserId: userId,
          },
        });

        // 4. Actualizar estado y saldos del receivable
        const updated = await tx.receivable.update({
          where: { id: receivableId },
          data: {
            balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
            amountPaid: new Prisma.Decimal(centsToMoneyString(newAmountPaidCents)),
            status: 'PENDIENTE' satisfies ReceivableStatus,
          },
          include: {
            customer: { select: { name: true } },
            sale: { select: { invoiceNumber: true } },
          },
        });

        // 5. Compensación financiera
        const amountStr = centsToMoneyString(paymentAmountCents);
        if (payment.paymentMethod === 'TRANSFERENCIA') {
          if (!payment.bankAccountId) {
            throw new BadRequestException(
              'El abono por transferencia no tiene cuenta bancaria asociada.',
            );
          }
          await recordSourceBankMovement(tx, {
            bankAccountId: payment.bankAccountId,
            movementType: 'WITHDRAWAL',
            amount: amountStr,
            concept: `Reversión abono cartera - Factura ${updated.sale?.invoiceNumber ?? receivableId}: ${trimmedReason}`,
            referenceDocumentType: 'RECEIVABLE_PAYMENT_REVERSAL',
            referenceDocumentId: payment.id,
            createdById: userId,
          });
        } else {
          await this.cashService.recordMovementInTransaction(tx, {
            movementType: 'EGRESO_MANUAL',
            amount: amountStr,
            paymentMethod: 'EFECTIVO',
            reason: `Reversión abono cartera - Factura ${updated.sale?.invoiceNumber ?? receivableId}: ${trimmedReason}`,
            referenceDocumentType: 'RECEIVABLE_PAYMENT_REVERSAL',
            referenceDocumentId: payment.id,
            createdByUserId: userId,
          });
        }

        // Reversión contable automática
        await this.accountingEngine.handleCustomerPaymentReversed(
          payment.id,
          trimmedReason,
          userId,
          tx,
        );

        // 6. Auditoría
        await tx.auditEvent.create({
          data: {
            userId,
            action: 'REVERSE_RECEIVABLE_PAYMENT',
            entity: 'receivable_payments',
            entityId: paymentId,
            details: {
              receivableId,
              paymentId,
              amount: amountStr,
              paymentMethod: payment.paymentMethod,
              bankAccountId: payment.bankAccountId,
              reason: trimmedReason,
              balanceBefore: centsToMoneyString(balanceCents),
              balanceAfter: centsToMoneyString(newBalanceCents),
            } as unknown as Prisma.InputJsonValue,
          },
        });

        const payments = await tx.receivablePayment.findMany({
          where: { receivableId },
          orderBy: { createdAt: 'asc' },
        });

        return this.toDto(updated, payments);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}
