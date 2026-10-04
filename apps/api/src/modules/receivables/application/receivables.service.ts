import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import { CashService } from '../../cash/application/cash.service';
import {
  ReceivableDto,
  ReceivableQueryFilters,
  RegisterReceivablePaymentPayload,
  PaginatedResponse,
  AgingSummaryDto,
} from '@farmacia/contracts';
import { centsToMoneyString, parseMoneyToCents } from '../../treasury/domain/treasury-rules';
import { recordSourceBankMovement } from '../../treasury/application/record-source-bank-movement';
import {
  findPaymentRetry,
  parsePaymentAmount,
  paymentRequestHash,
  requirePaymentBankAccountId,
  savePaymentRetry,
} from '../../treasury/application/payment-idempotency';
import { Optional } from '@nestjs/common';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly cashService: CashService,
    @Optional() private readonly accountingEngine?: AccountingEngineService,
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
        reversedAt: p.reversedAt instanceof Date ? p.reversedAt.toISOString() : p.reversedAt ?? null,
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
      where.dueDate = { lt: new Date() };
      where.status = 'PENDIENTE';
    }
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
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

  // ------------------------------------------------------------------ //
  //  Commands
  // ------------------------------------------------------------------ //

  /**
   * Registra un abono a una cuenta por cobrar.
   * HU-020 CA-2: POST /api/v1/receivables/:id/payments
   * - Bloqueo pesimista con SELECT FOR UPDATE
   * - Actualiza saldo y estado en la misma transacción
   * - Genera ingreso en caja
   */
  async registerPayment(
    receivableId: string,
    payload: RegisterReceivablePaymentPayload,
    userId: string,
    idempotencyKey?: string,
  ): Promise<ReceivableDto> {
    const amountCents = parsePaymentAmount(payload.amount, 'Monto del abono');
    if (amountCents <= 0n) {
      throw new BadRequestException('El monto del abono debe ser mayor a cero');
    }
    const method = payload.paymentMethod ?? 'EFECTIVO';
    if (method !== 'EFECTIVO' && method !== 'TRANSFERENCIA') {
      throw new BadRequestException(
        'El pago con tarjeta requiere una política de liquidación aprobada; use EFECTIVO o TRANSFERENCIA.',
      );
    }
    if (method === 'TRANSFERENCIA') {
      requirePaymentBankAccountId(payload.bankAccountId);
      if (!idempotencyKey)
        throw new BadRequestException('Idempotency-Key es obligatorio para transferencias.');
    } else if (payload.bankAccountId) {
      throw new BadRequestException('Una cuenta bancaria solo corresponde a TRANSFERENCIA.');
    }
    const endpoint = `/api/v1/receivables/${receivableId}/payments`;
    const requestHash = paymentRequestHash(endpoint, userId, payload);

    return prisma.$transaction(async (tx: any) => {
      const cached = await findPaymentRetry<ReceivableDto>(tx, idempotencyKey, requestHash);
      if (cached) return cached;
      // 1. Bloqueo pesimista para evitar doble abono concurrente
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
          notes,
          created_at  AS "createdAt",
          updated_at  AS "updatedAt"
        FROM receivables
        WHERE id = ${receivableId}::uuid
        FOR UPDATE
      `;

      if (!rows.length) {
        throw new NotFoundException(`Cuenta por cobrar "${receivableId}" no encontrada`);
      }

      const raw = rows[0];
      if (raw.status !== 'PENDIENTE') {
        throw new BadRequestException(`No se puede abonar a una cuenta en estado "${raw.status}"`);
      }
      const balanceCents = parseMoneyToCents(raw.balance.toString(), 'Saldo pendiente');
      if (amountCents > balanceCents) {
        throw new BadRequestException('El monto del abono supera el saldo pendiente.');
      }
      const amountPaidCents = parseMoneyToCents(raw.amountPaid.toString(), 'Total abonado');
      const newBalanceCents = balanceCents - amountCents;
      const amount = centsToMoneyString(amountCents);

      // 3. Persistir cambios en receivable
      const updated = await (tx as any).receivable.update({
        where: { id: receivableId },
        data: {
          amountPaid: new Prisma.Decimal(centsToMoneyString(amountPaidCents + amountCents)),
          balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
          status: newBalanceCents === 0n ? 'PAGADA' : 'PENDIENTE',
        },
        include: {
          customer: { select: { name: true } },
          sale: { select: { invoiceNumber: true } },
          payments: { orderBy: { createdAt: 'asc' } },
        },
      });

      // 4. Registrar pago
      const payment = await (tx as any).receivablePayment.create({
        data: {
          receivableId,
          amount: new Prisma.Decimal(amount),
          paymentMethod: method,
          bankAccountId: method === 'TRANSFERENCIA' ? payload.bankAccountId : null,
          notes: payload.notes ?? null,
          createdByUserId: userId,
        },
      });

      // 5. Ingreso a caja (dentro de la misma transacción)
      if (method === 'TRANSFERENCIA') {
        await recordSourceBankMovement(tx, {
          bankAccountId: payload.bankAccountId!,
          movementType: 'DEPOSIT',
          amount,
          concept: `Abono cartera - Factura ${updated.sale?.invoiceNumber ?? receivableId}`,
          referenceDocumentType: 'RECEIVABLE_PAYMENT',
          referenceDocumentId: payment.id,
          createdById: userId,
        });
      } else {
        await this.cashService.recordMovementInTransaction(tx, {
          movementType: 'INGRESO_MANUAL',
          amount,
          paymentMethod: 'EFECTIVO',
          reason: `Abono cartera - Factura ${updated.sale?.invoiceNumber ?? receivableId}`,
          referenceDocumentType: 'RECEIVABLE',
          referenceDocumentId: receivableId,
          createdByUserId: userId,
        });
      }

      // 5.1. Asiento contable automático
      if (this.accountingEngine) {
        await this.accountingEngine.handleCustomerPayment(
          {
            id: payment.id,
            receivableId,
            amount: payment.amount,
            paymentMethod: method,
            createdByUserId: userId,
            customerName: updated.customer?.name,
            invoiceNumber: updated.sale?.invoiceNumber,
          },
          tx,
        );
      }

      // Leer los pagos actualizados para devolver
      const payments = await (tx as any).receivablePayment.findMany({
        where: { receivableId },
        orderBy: { createdAt: 'asc' },
      });

      const result = this.toDto(updated, payments);
      await savePaymentRetry(tx, {
        key: idempotencyKey,
        endpoint,
        hash: requestHash,
        userId,
        responseBody: result,
      });
      return result;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  /**
   * Resumen de Cartera de Clientes por Edades de Vencimiento.
   * Conforme a MODULO_CONTABILIDAD_FARMACIA.md: Corriente, 1-30, 31-60, 61-90, >90 días.
   */
  async getAgingSummary(): Promise<AgingSummaryDto> {
    const receivables = await prisma.receivable.findMany({
      where: {
        status: 'PENDIENTE',
        balance: { gt: 0 },
      },
      select: {
        balance: true,
        dueDate: true,
      },
    });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let currentCents = 0n;
    let currentCount = 0;
    let days1To30Cents = 0n;
    let days1To30Count = 0;
    let days31To60Cents = 0n;
    let days31To60Count = 0;
    let days61To90Cents = 0n;
    let days61To90Count = 0;
    let daysOver90Cents = 0n;
    let daysOver90Count = 0;

    for (const r of receivables) {
      const balanceCents = parseMoneyToCents(r.balance.toString(), 'Saldo de cuenta por cobrar');
      const due = new Date(r.dueDate);
      due.setHours(0, 0, 0, 0);

      const diffTime = now.getTime() - due.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        currentCents += balanceCents;
        currentCount++;
      } else if (diffDays <= 30) {
        days1To30Cents += balanceCents;
        days1To30Count++;
      } else if (diffDays <= 60) {
        days31To60Cents += balanceCents;
        days31To60Count++;
      } else if (diffDays <= 90) {
        days61To90Cents += balanceCents;
        days61To90Count++;
      } else {
        daysOver90Cents += balanceCents;
        daysOver90Count++;
      }
    }

    const totalCents =
      currentCents + days1To30Cents + days31To60Cents + days61To90Cents + daysOver90Cents;
    const totalCount =
      currentCount + days1To30Count + days31To60Count + days61To90Count + daysOver90Count;

    return {
      current: { amount: centsToMoneyString(currentCents), count: currentCount },
      days1To30: { amount: centsToMoneyString(days1To30Cents), count: days1To30Count },
      days31To60: { amount: centsToMoneyString(days31To60Cents), count: days31To60Count },
      days61To90: { amount: centsToMoneyString(days61To90Cents), count: days61To90Count },
      daysOver90: { amount: centsToMoneyString(daysOver90Cents), count: daysOver90Count },
      totalPending: centsToMoneyString(totalCents),
      totalCount,
    };
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

    return prisma.$transaction(async (tx: any) => {
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

      // 2. Buscar el abono a revertir
      const payment = await tx.receivablePayment.findUnique({
        where: { id: paymentId },
      });

      if (!payment || payment.receivableId !== receivableId) {
        throw new NotFoundException(`Abono "${paymentId}" no encontrado en esta cuenta por cobrar`);
      }

      if (payment.isReversed) {
        throw new BadRequestException('Este abono ya fue revertido previamente.');
      }

      const paymentAmountCents = parseMoneyToCents(payment.amount.toString(), 'Monto del abono a revertir');
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
          status: 'PENDIENTE',
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
          throw new BadRequestException('El abono por transferencia no tiene cuenta bancaria asociada.');
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
      if (this.accountingEngine) {
        await this.accountingEngine.handleCustomerPaymentReversed(
          payment.id,
          trimmedReason,
          userId,
          tx,
        );
      }

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
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
