import {
  businessDayStart,
  businessDayEnd,
  businessToday,
  calendarDate,
} from '../../../common/utils/business-date';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import { CashService } from '../../cash/application/cash.service';
import {
  PayableDto,
  PayableQueryFilters,
  RegisterPayablePaymentPayload,
  PaginatedResponse,
  AgingBreakdownDto,
  PayableMovementsDto,
} from '@farmacia/contracts';
import { buildDocumentMovements, RawDocumentMovement } from '../../../common/utils/document-movements';
import { centsToMoneyString, parseMoneyToCents } from '../../treasury/domain/treasury-rules';
import { recordSourceBankMovement } from '../../treasury/application/record-source-bank-movement';
import {
  parsePaymentAmount,
  requirePaymentBankAccountId,
} from '../../treasury/application/payment-validation';
import { agingBreakdown, agingBucketOf, daysOverdue } from '../../../common/utils/aging';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';

@Injectable()
export class PayablesService {
  constructor(
    private readonly cashService: CashService,
    private readonly accountingEngine: AccountingEngineService,
    private readonly idempotencyService: IdempotencyService = new IdempotencyService(),
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
        reversedAt:
          p.reversedAt instanceof Date ? p.reversedAt.toISOString() : (p.reversedAt ?? null),
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
    // Todo pago mueve dinero: un reintento sin clave lo duplicaría (AGENTS.md §6).
    if (!idempotencyKey?.trim())
      throw new BadRequestException('Idempotency-Key es obligatorio para registrar un pago.');
    if (method === 'TRANSFERENCIA') {
      requirePaymentBankAccountId(payload.bankAccountId);
    } else if (payload.bankAccountId) {
      throw new BadRequestException('Una cuenta bancaria solo corresponde a TRANSFERENCIA.');
    }
    const endpoint = `/api/v1/payables/${payableId}/payments`;
    const requestHash = this.idempotencyService.computeHash(endpoint, userId, payload);

    return this.idempotencyService.retryOnSerialization(() =>
      prisma.$transaction(
        async (tx: any) => {
          const cached = idempotencyKey
            ? await this.idempotencyService.getRecord(idempotencyKey, requestHash, tx, 'http')
            : null;
          if (cached) return cached.responseBody as PayableDto;
          const applied = await this.applyPaymentInTransaction(tx, {
            payableId,
            amountCents,
            paymentMethod: method,
            bankAccountId: method === 'TRANSFERENCIA' ? payload.bankAccountId! : null,
            notes: payload.notes ?? null,
            userId,
          });
          const concept = `Pago proveedor - Factura ${applied.invoiceNumber ?? payableId}`;
          const amount = centsToMoneyString(amountCents);

          // Egreso de caja o banco (misma transacción); el trigger emite su comprobante
          let document: { id: string } | null;
          if (method === 'TRANSFERENCIA') {
            const movementId = await recordSourceBankMovement(tx, {
              bankAccountId: payload.bankAccountId!,
              movementType: 'WITHDRAWAL',
              amount,
              concept,
              referenceDocumentType: 'PAYABLE_PAYMENT',
              referenceDocumentId: applied.paymentId,
              createdById: userId,
            });
            document = await tx.treasuryDocument.findUnique({ where: { bankMovementId: movementId } });
          } else {
            const movementId = await this.cashService.recordMovementInTransaction(tx, {
              movementType: 'EGRESO_PAGO_PROVEEDOR',
              amount,
              paymentMethod: 'EFECTIVO',
              reason: concept,
              referenceDocumentType: 'PAYABLE',
              referenceDocumentId: payableId,
              createdByUserId: userId,
            });
            document = await tx.treasuryDocument.findUnique({ where: { cashMovementId: movementId } });
          }
          if (document) {
            await tx.payablePayment.update({
              where: { id: applied.paymentId },
              data: { treasuryDocumentId: document.id },
            });
          }
          const updated = await tx.payable.findUniqueOrThrow({
            where: { id: payableId },
            include: {
              supplier: { select: { name: true } },
              purchase: { select: { invoiceNumber: true } },
            },
          });

          // Leer pagos actualizados para retornar
          const payments = await (tx as any).payablePayment.findMany({
            where: { payableId },
            orderBy: { createdAt: 'asc' },
          });

          const result = this.toDto(updated, payments);
          if (idempotencyKey) {
            await this.idempotencyService.saveRecord(
              {
                key: idempotencyKey,
                endpoint,
                requestHash,
                userId,
                responseStatus: 201,
                responseBody: result,
              },
              tx,
            );
          }
          return result;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    );
  }

  /** Movimientos de una factura de compra con el saldo después de cada uno. */
  async getMovements(id: string): Promise<PayableMovementsDto> {
    const row = await prisma.payable.findUnique({
      where: { id },
      include: {
        supplier: { select: { name: true } },
        purchase: {
          select: {
            invoiceNumber: true,
            purchaseDate: true,
            createdAt: true,
            debitNotes: {
              select: {
                debitNoteNumber: true,
                reason: true,
                total: true,
                withholdingIncome: true,
                withholdingVat: true,
                withholdingIca: true,
                createdAt: true,
              },
            },
          },
        },
        payments: { include: { treasuryDocument: { select: { documentNumber: true } } } },
      },
    });
    if (!row) {
      throw new NotFoundException(`Cuenta por pagar "${id}" no encontrada`);
    }
    const toCents = (value: Prisma.Decimal) => parseMoneyToCents(value.toFixed(2), 'Valor');
    // La nota débito baja el total y el saldo por su valor neto de retenciones
    const notes = (row.purchase?.debitNotes ?? []).map((n) => ({
      ...n,
      netCents:
        toCents(n.total) - toCents(n.withholdingIncome) - toCents(n.withholdingVat) - toCents(n.withholdingIca),
    }));
    const raw: RawDocumentMovement[] = [
      {
        at: row.purchase?.createdAt ?? row.createdAt,
        type: 'CARGO',
        documentNumber: row.purchase?.invoiceNumber ?? null,
        description: 'Factura de compra',
        deltaCents: toCents(row.totalAmount) + notes.reduce((acc, n) => acc + n.netCents, 0n),
      },
    ];
    for (const note of notes) {
      raw.push({
        at: note.createdAt,
        type: 'NOTA_DEBITO',
        documentNumber: note.debitNoteNumber,
        description: `Devolución al proveedor: ${note.reason}`,
        deltaCents: -note.netCents,
      });
    }
    for (const payment of row.payments) {
      raw.push({
        at: payment.createdAt,
        type: 'ABONO',
        documentNumber: payment.treasuryDocument?.documentNumber ?? null,
        description: payment.notes || 'Pago al proveedor',
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
          description: `Reversión del pago: ${payment.reversalReason ?? ''}`.trim(),
          paymentMethod: payment.paymentMethod,
          deltaCents: toCents(payment.amount),
        });
      }
    }
    return {
      payableId: row.id,
      invoiceNumber: row.purchase?.invoiceNumber ?? null,
      supplierName: row.supplier?.name ?? null,
      totalAmount: row.totalAmount.toFixed(2),
      amountPaid: row.amountPaid.toFixed(2),
      balance: row.balance.toFixed(2),
      status: row.status,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      movements: buildDocumentMovements(raw),
    };
  }

  /**
   * Aplica un pago a una factura de compra dentro de la transacción del llamador: bloquea la
   * cuenta, valida estado, saldo y proveedor, actualiza saldos, registra el pago y su asiento.
   * El movimiento de dinero lo registra el comprobante de egreso que respalda el pago.
   */
  async applyPaymentInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      payableId: string;
      amountCents: bigint;
      paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA';
      bankAccountId: string | null;
      notes: string | null;
      userId: string;
      treasuryDocumentId?: string;
      /** Proveedor del egreso: la factura debe ser suya */
      expectedSupplierId?: string;
    },
  ): Promise<{ paymentId: string; invoiceNumber: string | null; supplierName: string | null }> {
    if (input.amountCents <= 0n) {
      throw new BadRequestException('El monto del pago debe ser mayor a cero');
    }
    const rows = await tx.$queryRaw<
      Array<{ supplierId: string; amountPaid: Prisma.Decimal; balance: Prisma.Decimal; status: string }>
    >`
      SELECT supplier_id AS "supplierId", amount_paid AS "amountPaid", balance, status
      FROM payables
      WHERE id = ${input.payableId}::uuid
      FOR UPDATE
    `;
    if (!rows.length) {
      throw new NotFoundException(`Cuenta por pagar "${input.payableId}" no encontrada`);
    }
    const raw = rows[0];
    if (input.expectedSupplierId && raw.supplierId !== input.expectedSupplierId) {
      throw new BadRequestException('La factura seleccionada no pertenece al proveedor del egreso.');
    }
    if (raw.status !== 'PENDIENTE') {
      throw new BadRequestException(`No se puede pagar una cuenta en estado "${raw.status}"`);
    }
    const balanceCents = parseMoneyToCents(raw.balance.toString(), 'Saldo pendiente');
    if (input.amountCents > balanceCents) {
      throw new BadRequestException('El monto del pago supera el saldo pendiente.');
    }
    const amountPaidCents = parseMoneyToCents(raw.amountPaid.toString(), 'Total pagado');
    const newBalanceCents = balanceCents - input.amountCents;
    const amount = centsToMoneyString(input.amountCents);

    const updated = await tx.payable.update({
      where: { id: input.payableId },
      data: {
        amountPaid: new Prisma.Decimal(centsToMoneyString(amountPaidCents + input.amountCents)),
        balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
        status: newBalanceCents === 0n ? 'PAGADA' : 'PENDIENTE',
      },
      include: {
        supplier: { select: { name: true } },
        purchase: { select: { invoiceNumber: true } },
      },
    });
    const payment = await tx.payablePayment.create({
      data: {
        payableId: input.payableId,
        amount: new Prisma.Decimal(amount),
        paymentMethod: input.paymentMethod,
        bankAccountId: input.paymentMethod === 'TRANSFERENCIA' ? input.bankAccountId : null,
        notes: input.notes,
        createdByUserId: input.userId,
        treasuryDocumentId: input.treasuryDocumentId ?? null,
      },
    });
    await this.accountingEngine.handleSupplierPayment(
      {
        id: payment.id,
        payableId: input.payableId,
        amount: payment.amount,
        paymentMethod: input.paymentMethod,
        bankAccountId: input.paymentMethod === 'TRANSFERENCIA' ? input.bankAccountId : null,
        createdByUserId: input.userId,
        supplierName: updated.supplier?.name,
        invoiceNumber: updated.purchase?.invoiceNumber,
      },
      tx,
    );
    return {
      paymentId: payment.id,
      invoiceNumber: updated.purchase?.invoiceNumber ?? null,
      supplierName: updated.supplier?.name ?? null,
    };
  }

  /**
   * Resumen por edades de las facturas pendientes: Corriente (no vencida o hasta 30 días),
   * 31–60, 61–90 y más de 90 días vencida (los mismos rangos en cartera y cuentas por pagar).
   */
  async getAgingSummary(): Promise<AgingBreakdownDto> {
    const rows = await prisma.payable.findMany({
      where: { status: 'PENDIENTE', balance: { gt: 0 } },
      select: { balance: true, dueDate: true },
    });
    const today = calendarDate(businessToday());
    return agingBreakdown(
      rows.map((row) => ({
        balanceCents: parseMoneyToCents(row.balance.toString(), 'Saldo de cuenta por pagar'),
        bucket: agingBucketOf(daysOverdue(row.dueDate, today)),
      })),
    );
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

    return prisma.$transaction(
      async (tx: any) => {
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

        const paymentAmountCents = parseMoneyToCents(
          payment.amount.toString(),
          'Monto del pago a revertir',
        );
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
            throw new BadRequestException(
              'El pago por transferencia no tiene cuenta bancaria asociada.',
            );
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
        await this.accountingEngine.handleSupplierPaymentReversed(
          payment.id,
          trimmedReason,
          userId,
          tx,
        );

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
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}
