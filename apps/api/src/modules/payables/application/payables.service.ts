import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import { CashService } from '../../cash/application/cash.service';
import {
  PayableDto,
  PayableQueryFilters,
  RegisterPayablePaymentPayload,
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
export class PayablesService {
  constructor(
    private readonly cashService: CashService,
    @Optional() private readonly accountingEngine?: AccountingEngineService,
  ) {}

  // ------------------------------------------------------------------ //
  //  Mapping
  // ------------------------------------------------------------------ //

  private toDto(row: any, payments?: any[]): PayableDto {
    const rawNotes = row.purchase?.notes || row.notes || '';
    let paymentCondition: string | null = null;
    if (rawNotes.includes('Condición: Contado')) {
      paymentCondition = 'CONTADO';
    } else if (rawNotes.includes('Condición: Crédito')) {
      paymentCondition = 'CREDITO';
    } else if (row.dueDate && row.purchase?.purchaseDate) {
      const dueStr =
        row.dueDate instanceof Date
          ? row.dueDate.toISOString().split('T')[0]
          : String(row.dueDate).split('T')[0];
      const purStr =
        row.purchase.purchaseDate instanceof Date
          ? row.purchase.purchaseDate.toISOString().split('T')[0]
          : String(row.purchase.purchaseDate).split('T')[0];
      paymentCondition = dueStr <= purStr ? 'CONTADO' : 'CREDITO';
    }

    return {
      id: row.id,
      purchaseId: row.purchaseId,
      supplierId: row.supplierId,
      supplierName: row.supplier?.name ?? undefined,
      invoiceNumber: row.purchase?.invoiceNumber ?? undefined,
      totalAmount: row.totalAmount.toString(),
      amountPaid: row.amountPaid.toString(),
      balance: row.balance.toString(),
      status: row.status,
      paymentCondition,
      dueDate:
        row.dueDate instanceof Date
          ? row.dueDate.toISOString().split('T')[0]
          : String(row.dueDate).split('T')[0],
      notes: row.notes ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
      payments: payments?.map((p) => ({
        id: p.id,
        payableId: p.payableId,
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

  async findAll(filters: PayableQueryFilters): Promise<PaginatedResponse<PayableDto>> {
    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.min(filters.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (filters.supplierId) where.supplierId = filters.supplierId;
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
      prisma.payable.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { dueDate: 'asc' },
        include: {
          supplier: { select: { name: true } },
          purchase: { select: { invoiceNumber: true, notes: true, purchaseDate: true } },
        },
      }),
      prisma.payable.count({ where }),
    ]);

    return {
      items: items.map((r: any) => this.toDto(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findById(id: string): Promise<PayableDto> {
    const row = await prisma.payable.findUnique({
      where: { id },
      include: {
        supplier: { select: { name: true } },
        purchase: { select: { invoiceNumber: true, notes: true, purchaseDate: true } },
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) {
      throw new NotFoundException(`Cuenta por pagar "${id}" no encontrada`);
    }
    return this.toDto(row, row.payments);
  }

  // ------------------------------------------------------------------ //
  //  Commands
  // ------------------------------------------------------------------ //

  /**
   * Registra un pago a una cuenta por pagar.
   * HU-021 CA-2: POST /api/v1/payables/:id/payments
   * - Bloqueo pesimista SELECT FOR UPDATE
   * - Actualiza saldo en misma transacción
   * - Genera egreso de caja
   */
  async registerPayment(
    payableId: string,
    payload: RegisterPayablePaymentPayload,
    userId: string,
    idempotencyKey?: string,
  ): Promise<PayableDto> {
    const amountCents = parsePaymentAmount(payload.amount, 'Monto del pago');
    if (amountCents <= 0n) {
      throw new BadRequestException('El monto del pago debe ser mayor a cero');
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
    const endpoint = `/api/v1/payables/${payableId}/payments`;
    const requestHash = paymentRequestHash(endpoint, userId, payload);

    return prisma.$transaction(async (tx: any) => {
      const cached = await findPaymentRetry<PayableDto>(tx, idempotencyKey, requestHash);
      if (cached) return cached;
      // 1. Bloqueo pesimista
      const rows = await tx.$queryRaw<any[]>`
        SELECT
          id,
          purchase_id  AS "purchaseId",
          supplier_id  AS "supplierId",
          total_amount AS "totalAmount",
          amount_paid  AS "amountPaid",
          balance,
          status,
          due_date     AS "dueDate",
          notes,
          created_at   AS "createdAt",
          updated_at   AS "updatedAt"
        FROM payables
        WHERE id = ${payableId}::uuid
        FOR UPDATE
      `;

      if (!rows.length) {
        throw new NotFoundException(`Cuenta por pagar "${payableId}" no encontrada`);
      }

      const raw = rows[0];
      if (raw.status !== 'PENDIENTE') {
        throw new BadRequestException(`No se puede pagar una cuenta en estado "${raw.status}"`);
      }
      const balanceCents = parseMoneyToCents(raw.balance.toString(), 'Saldo pendiente');
      if (amountCents > balanceCents) {
        throw new BadRequestException('El monto del pago supera el saldo pendiente.');
      }
      const amountPaidCents = parseMoneyToCents(raw.amountPaid.toString(), 'Total pagado');
      const newBalanceCents = balanceCents - amountCents;
      const amount = centsToMoneyString(amountCents);

      // 3. Persistir cambios en payable
      const updated = await (tx as any).payable.update({
        where: { id: payableId },
        data: {
          amountPaid: new Prisma.Decimal(centsToMoneyString(amountPaidCents + amountCents)),
          balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
          status: newBalanceCents === 0n ? 'PAGADA' : 'PENDIENTE',
        },
        include: {
          supplier: { select: { name: true } },
          purchase: { select: { invoiceNumber: true } },
          payments: { orderBy: { createdAt: 'asc' } },
        },
      });

      // 4. Registrar pago
      const payment = await (tx as any).payablePayment.create({
        data: {
          payableId,
          amount: new Prisma.Decimal(amount),
          paymentMethod: method,
          bankAccountId: method === 'TRANSFERENCIA' ? payload.bankAccountId : null,
          notes: payload.notes ?? null,
          createdByUserId: userId,
        },
      });

      // 5. Egreso de caja (dentro de la misma transacción)
      if (method === 'TRANSFERENCIA') {
        await recordSourceBankMovement(tx, {
          bankAccountId: payload.bankAccountId!,
          movementType: 'WITHDRAWAL',
          amount,
          concept: `Pago proveedor - Factura ${updated.purchase?.invoiceNumber ?? payableId}`,
          referenceDocumentType: 'PAYABLE_PAYMENT',
          referenceDocumentId: payment.id,
          createdById: userId,
        });
      } else {
        await this.cashService.recordMovementInTransaction(tx, {
          movementType: 'EGRESO_PAGO_PROVEEDOR',
          amount,
          paymentMethod: 'EFECTIVO',
          reason: `Pago proveedor - Factura ${updated.purchase?.invoiceNumber ?? payableId}`,
          referenceDocumentType: 'PAYABLE',
          referenceDocumentId: payableId,
          createdByUserId: userId,
        });
      }

      // 5.1. Asiento contable automático
      if (this.accountingEngine) {
        await this.accountingEngine.handleSupplierPayment(
          {
            id: payment.id,
            payableId,
            amount: payment.amount,
            paymentMethod: method,
            createdByUserId: userId,
            supplierName: updated.supplier?.name,
            invoiceNumber: updated.purchase?.invoiceNumber,
          },
          tx,
        );
      }

      // Leer pagos actualizados para retornar
      const payments = await (tx as any).payablePayment.findMany({
        where: { payableId },
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
   * Resumen de Cartera de Proveedores por Edades de Vencimiento.
   * Conforme a MODULO_CONTABILIDAD_FARMACIA.md: Corriente, 1-30, 31-60, 61-90, >90 días.
   */
  async getAgingSummary(): Promise<AgingSummaryDto> {
    const payables = await prisma.payable.findMany({
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

    for (const p of payables) {
      const balanceCents = parseMoneyToCents(p.balance.toString(), 'Saldo de cuenta por pagar');
      const due = new Date(p.dueDate);
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
   * Reversión controlada de un pago a proveedor con restitución de saldo y contrasentido financiero.
   */
  async revertPayment(
    payableId: string,
    paymentId: string,
    reason: string,
    userId: string,
  ): Promise<PayableDto> {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new BadRequestException('El motivo de la reversión es obligatorio.');
    }

    return prisma.$transaction(async (tx: any) => {
      // 1. Bloqueo pesimista del payable
      const rows = await tx.$queryRaw<any[]>`
        SELECT
          id,
          purchase_id  AS "purchaseId",
          supplier_id  AS "supplierId",
          total_amount AS "totalAmount",
          amount_paid  AS "amountPaid",
          balance,
          status,
          due_date     AS "dueDate",
          notes
        FROM payables
        WHERE id = ${payableId}::uuid
        FOR UPDATE
      `;

      if (!rows.length) {
        throw new NotFoundException(`Cuenta por pagar "${payableId}" no encontrada`);
      }

      const raw = rows[0];

      // 2. Buscar el pago a revertir
      const payment = await tx.payablePayment.findUnique({
        where: { id: paymentId },
      });

      if (!payment || payment.payableId !== payableId) {
        throw new NotFoundException(`Pago "${paymentId}" no encontrado en esta cuenta por pagar`);
      }

      if (payment.isReversed) {
        throw new BadRequestException('Este pago ya fue revertido previamente.');
      }

      const paymentAmountCents = parseMoneyToCents(payment.amount.toString(), 'Monto del pago a revertir');
      const balanceCents = parseMoneyToCents(raw.balance.toString(), 'Saldo pendiente');
      const amountPaidCents = parseMoneyToCents(raw.amountPaid.toString(), 'Total pagado');

      const newBalanceCents = balanceCents + paymentAmountCents;
      const newAmountPaidCents = amountPaidCents - paymentAmountCents;

      if (newAmountPaidCents < 0n) {
        throw new BadRequestException('El monto del reverso excede el total pagado registrado.');
      }

      // 3. Marcar pago como revertido
      await tx.payablePayment.update({
        where: { id: paymentId },
        data: {
          isReversed: true,
          reversedAt: new Date(),
          reversalReason: trimmedReason,
          reversedByUserId: userId,
        },
      });

      // 4. Actualizar estado y saldos del payable
      const updated = await tx.payable.update({
        where: { id: payableId },
        data: {
          balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
          amountPaid: new Prisma.Decimal(centsToMoneyString(newAmountPaidCents)),
          status: 'PENDIENTE',
        },
        include: {
          supplier: { select: { name: true } },
          purchase: { select: { invoiceNumber: true, notes: true, purchaseDate: true } },
        },
      });

      // 5. Compensación financiera
      const amountStr = centsToMoneyString(paymentAmountCents);
      if (payment.paymentMethod === 'TRANSFERENCIA') {
        if (!payment.bankAccountId) {
          throw new BadRequestException('El pago por transferencia no tiene cuenta bancaria asociada.');
        }
        await recordSourceBankMovement(tx, {
          bankAccountId: payment.bankAccountId,
          movementType: 'DEPOSIT',
          amount: amountStr,
          concept: `Reversión pago proveedor - Factura ${updated.purchase?.invoiceNumber ?? payableId}: ${trimmedReason}`,
          referenceDocumentType: 'PAYABLE_PAYMENT_REVERSAL',
          referenceDocumentId: payment.id,
          createdById: userId,
        });
      } else {
        await this.cashService.recordMovementInTransaction(tx, {
          movementType: 'INGRESO_MANUAL',
          amount: amountStr,
          paymentMethod: 'EFECTIVO',
          reason: `Reversión pago proveedor - Factura ${updated.purchase?.invoiceNumber ?? payableId}: ${trimmedReason}`,
          referenceDocumentType: 'PAYABLE_PAYMENT_REVERSAL',
          referenceDocumentId: payment.id,
          createdByUserId: userId,
        });
      }

      // Reversión contable automática
      if (this.accountingEngine) {
        await this.accountingEngine.handleSupplierPaymentReversed(
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
          action: 'REVERSE_PAYABLE_PAYMENT',
          entity: 'payable_payments',
          entityId: paymentId,
          details: {
            payableId,
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

      const payments = await tx.payablePayment.findMany({
        where: { payableId },
        orderBy: { createdAt: 'asc' },
      });

      return this.toDto(updated, payments);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
