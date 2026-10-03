import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import { CashService } from '../../cash/application/cash.service';
import {
  ReceivableDto,
  ReceivableQueryFilters,
  RegisterReceivablePaymentPayload,
  PaginatedResponse,
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

@Injectable()
export class ReceivablesService {
  constructor(private readonly cashService: CashService) {}

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
      if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
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
          amount: Number(amount),
          paymentMethod: 'EFECTIVO',
          reason: `Abono cartera - Factura ${updated.sale?.invoiceNumber ?? receivableId}`,
          referenceDocumentType: 'RECEIVABLE',
          referenceDocumentId: receivableId,
          createdByUserId: userId,
        });
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
    });
  }
}
