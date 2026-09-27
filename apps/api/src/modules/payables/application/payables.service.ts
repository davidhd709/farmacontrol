import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { prisma } from '@farmacia/database';
import { CashService } from '../../cash/application/cash.service';
import {
  PayableDto,
  PayableQueryFilters,
  RegisterPayablePaymentPayload,
  PaginatedResponse,
} from '@farmacia/contracts';
import { Payable } from '../domain/payable.entity';

@Injectable()
export class PayablesService {
  constructor(
    private readonly cashService: CashService,
  ) {}

  // ------------------------------------------------------------------ //
  //  Mapping
  // ------------------------------------------------------------------ //

  private toDto(row: any, payments?: any[]): PayableDto {
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
        payableId: p.payableId,
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
    filters: PayableQueryFilters,
  ): Promise<PaginatedResponse<PayableDto>> {
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
      if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
    }

    const [items, total] = await prisma.$transaction([
      prisma.payable.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { dueDate: 'asc' },
        include: {
          supplier: { select: { name: true } },
          purchase: { select: { invoiceNumber: true } },
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
        purchase: { select: { invoiceNumber: true } },
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
  ): Promise<PayableDto> {
    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('El monto del pago debe ser mayor a cero');
    }

    return prisma.$transaction(async (tx: any) => {
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
        throw new NotFoundException(
          `Cuenta por pagar "${payableId}" no encontrada`,
        );
      }

      const raw = rows[0];
      const payable = new Payable(
        raw.id,
        raw.purchaseId,
        raw.supplierId,
        Number(raw.totalAmount),
        Number(raw.amountPaid),
        Number(raw.balance),
        raw.status,
        raw.dueDate,
        raw.notes,
        raw.createdAt,
        raw.updatedAt,
      );

      // 2. Aplicar pago (valida reglas de negocio)
      try {
        payable.applyPayment(amount);
      } catch (err: any) {
        throw new BadRequestException(err.message);
      }

      // 3. Persistir cambios en payable
      const updated = await (tx as any).payable.update({
        where: { id: payableId },
        data: {
          amountPaid: payable.amountPaid,
          balance: payable.balance,
          status: payable.status,
        },
        include: {
          supplier: { select: { name: true } },
          purchase: { select: { invoiceNumber: true } },
          payments: { orderBy: { createdAt: 'asc' } },
        },
      });

      // 4. Registrar pago
      await (tx as any).payablePayment.create({
        data: {
          payableId,
          amount: amount,
          paymentMethod: payload.paymentMethod ?? 'EFECTIVO',
          notes: payload.notes ?? null,
          createdByUserId: userId,
        },
      });

      // 5. Egreso de caja (dentro de la misma transacción)
      await this.cashService.recordMovementInTransaction(tx, {
        movementType: 'EGRESO_PAGO_PROVEEDOR',
        amount,
        paymentMethod: payload.paymentMethod ?? 'EFECTIVO',
        reason: `Pago proveedor - Factura ${updated.purchase?.invoiceNumber ?? payableId}`,
        referenceDocumentType: 'PAYABLE',
        referenceDocumentId: payableId,
        createdByUserId: userId,
      });

      // Leer pagos actualizados para retornar
      const payments = await (tx as any).payablePayment.findMany({
        where: { payableId },
        orderBy: { createdAt: 'asc' },
      });

      return this.toDto(updated, payments);
    });
  }
}
