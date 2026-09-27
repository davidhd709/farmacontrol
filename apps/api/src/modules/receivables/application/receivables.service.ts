import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { prisma, PrismaClient } from '@farmacia/database';
import { CashService } from '../../cash/application/cash.service';
import {
  ReceivableDto,
  ReceivableQueryFilters,
  RegisterReceivablePaymentPayload,
  PaginatedResponse,
} from '@farmacia/contracts';
import { Receivable } from '../domain/receivable.entity';

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly cashService: CashService,
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
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : row.updatedAt,
      payments: payments?.map((p) => ({
        id: p.id,
        receivableId: p.receivableId,
        amount: p.amount.toString(),
        paymentMethod: p.paymentMethod,
        notes: p.notes ?? null,
        createdByUserId: p.createdByUserId,
        createdAt:
          p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      })),
    };
  }

  // ------------------------------------------------------------------ //
  //  Queries
  // ------------------------------------------------------------------ //

  async findAll(
    filters: ReceivableQueryFilters,
  ): Promise<PaginatedResponse<ReceivableDto>> {
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
  ): Promise<ReceivableDto> {
    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('El monto del abono debe ser mayor a cero');
    }

    return prisma.$transaction(async (tx: any) => {
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
        throw new NotFoundException(
          `Cuenta por cobrar "${receivableId}" no encontrada`,
        );
      }

      const raw = rows[0];
      const receivable = new Receivable(
        raw.id,
        raw.saleId,
        raw.customerId,
        Number(raw.totalAmount),
        Number(raw.amountPaid),
        Number(raw.balance),
        raw.status,
        raw.dueDate,
        raw.notes,
        raw.createdAt,
        raw.updatedAt,
      );

      // 2. Aplicar abono (valida reglas de negocio)
      try {
        receivable.applyPayment(amount);
      } catch (err: any) {
        throw new BadRequestException(err.message);
      }

      // 3. Persistir cambios en receivable
      const updated = await (tx as any).receivable.update({
        where: { id: receivableId },
        data: {
          amountPaid: receivable.amountPaid,
          balance: receivable.balance,
          status: receivable.status,
        },
        include: {
          customer: { select: { name: true } },
          sale: { select: { invoiceNumber: true } },
          payments: { orderBy: { createdAt: 'asc' } },
        },
      });

      // 4. Registrar pago
      await (tx as any).receivablePayment.create({
        data: {
          receivableId,
          amount: amount,
          paymentMethod: payload.paymentMethod ?? 'EFECTIVO',
          notes: payload.notes ?? null,
          createdByUserId: userId,
        },
      });

      // 5. Ingreso a caja (dentro de la misma transacción)
      await this.cashService.recordMovementInTransaction(tx, {
        movementType: 'INGRESO_MANUAL',
        amount,
        paymentMethod: payload.paymentMethod ?? 'EFECTIVO',
        reason: `Abono cartera - Factura ${updated.sale?.invoiceNumber ?? receivableId}`,
        referenceDocumentType: 'RECEIVABLE',
        referenceDocumentId: receivableId,
        createdByUserId: userId,
      });

      // Leer los pagos actualizados para devolver
      const payments = await (tx as any).receivablePayment.findMany({
        where: { receivableId },
        orderBy: { createdAt: 'asc' },
      });

      return this.toDto(updated, payments);
    });
  }
}
