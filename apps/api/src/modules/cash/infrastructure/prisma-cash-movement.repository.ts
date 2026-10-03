import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import {
  ICashMovementRepository,
  CreateCashMovementData,
} from '../domain/cash-movement.repository';
import { CashMovement } from '../domain/cash-movement.entity';
import {
  CashMovementQueryFilters,
  CashBalanceDto,
  PaymentMethod,
} from '@farmacia/contracts';
import {
  InvalidCashPaymentMethodException,
} from '../domain/cash.exceptions';
import {
  calculateNewCashBalanceCents,
  centsToMoneyString,
  parseMoneyToCents,
} from '../domain/cash-rules';

@Injectable()
export class PrismaCashMovementRepository implements ICashMovementRepository {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  async saveTransactional(
    data: CreateCashMovementData,
    externalTx?: any
  ): Promise<CashMovement> {
    if (data.paymentMethod !== 'EFECTIVO') {
      throw new InvalidCashPaymentMethodException();
    }
    const executeInTransaction = async (tx: any) => {
      // 0. Cerrojo transaccional determinista para serializar el cálculo del saldo de caja
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(742189321)`;

      // 1. Obtener el último movimiento para conocer el saldo anterior
      const lastRows = await tx.$queryRaw<Array<{ balance_after: Prisma.Decimal }>>`
        SELECT balance_after
        FROM cash_movements
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const previousBalanceCents =
        lastRows.length > 0
          ? parseMoneyToCents(lastRows[0].balance_after.toString(), 'Saldo anterior')
          : 0n;

      const amountCents = parseMoneyToCents(data.amount, 'Monto del movimiento');
      const { balanceAfter } = calculateNewCashBalanceCents(
        previousBalanceCents,
        data.movementType,
        amountCents,
      );

      const amountDecimal = new Prisma.Decimal(centsToMoneyString(amountCents));
      const balanceAfterDecimal = new Prisma.Decimal(centsToMoneyString(balanceAfter));

      // 2. Crear el movimiento inmutable
      const created = await tx.cashMovement.create({
        data: {
          movementType: data.movementType,
          amount: amountDecimal,
          paymentMethod: data.paymentMethod,
          reason: data.reason.trim(),
          referenceDocumentType: data.referenceDocumentType || null,
          referenceDocumentId: data.referenceDocumentId || null,
          balanceAfter: balanceAfterDecimal,
          createdByUserId: data.createdByUserId,
        },
        include: {
          createdByUser: true,
        },
      });

      return new CashMovement({
        id: created.id,
        movementType: created.movementType as any,
        amount: Number(created.amount),
        paymentMethod: created.paymentMethod as any,
        reason: created.reason,
        referenceDocumentType: created.referenceDocumentType,
        referenceDocumentId: created.referenceDocumentId,
        balanceAfter: Number(created.balanceAfter),
        createdAt: created.createdAt,
        createdByUserId: created.createdByUserId,
        createdByUsername: created.createdByUser?.username,
      });
    };

    if (externalTx) {
      return executeInTransaction(externalTx);
    }

    return this.client.$transaction(async (tx) => {
      return executeInTransaction(tx);
    });
  }

  async getCurrentBalance(paymentMethod?: PaymentMethod): Promise<CashBalanceDto> {
    // 1. Último movimiento general para el saldo actual de caja
    const lastMovement = await this.client.cashMovement.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const currentBalanceCents = lastMovement
      ? parseMoneyToCents(lastMovement.balanceAfter.toString(), 'Saldo de caja')
      : 0n;

    // 2. Calcular límites para hoy (00:00:00 hasta 23:59:59)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const todayWhere: Prisma.CashMovementWhereInput = {
      createdAt: { gte: startOfToday },
      ...(paymentMethod ? { paymentMethod } : {}),
    };

    const todayMovements = await this.client.cashMovement.findMany({
      where: todayWhere,
    });

    let totalIncomeTodayCents = 0n;
    let totalExpenseTodayCents = 0n;

    for (const mov of todayMovements) {
      const amountCents = parseMoneyToCents(mov.amount.toString(), 'Monto');
      if (
        mov.movementType === 'INGRESO_VENTA' ||
        mov.movementType === 'INGRESO_MANUAL'
      ) {
        totalIncomeTodayCents += amountCents;
      } else {
        totalExpenseTodayCents += amountCents;
      }
    }

    return {
      currentBalance: Number(centsToMoneyString(currentBalanceCents)),
      totalIncomeToday: Number(centsToMoneyString(totalIncomeTodayCents)),
      totalExpenseToday: Number(centsToMoneyString(totalExpenseTodayCents)),
      movementsCountToday: todayMovements.length,
      lastMovementAt: lastMovement?.createdAt ? lastMovement.createdAt.toISOString() : null,
    };
  }

  async findAll(
    filters: CashMovementQueryFilters
  ): Promise<{ items: CashMovement[]; total: number }> {
    const where: Prisma.CashMovementWhereInput = {};

    if (filters.movementType) {
      where.movementType = filters.movementType;
    }

    if (filters.paymentMethod) {
      where.paymentMethod = filters.paymentMethod;
    }

    const startDate = filters.startDate || (filters as any).fromDate;
    const endDate = filters.endDate || (filters as any).toDate;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        where.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (typeof endDate === 'string' && endDate.length === 10) {
          end.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.max(Number(filters.limit) || 20, 1);
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      this.client.cashMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          createdByUser: true,
        },
      }),
      this.client.cashMovement.count({ where }),
    ]);

    const items = records.map(
      (r) =>
        new CashMovement({
          id: r.id,
          movementType: r.movementType as any,
          amount: Number(r.amount),
          paymentMethod: r.paymentMethod as any,
          reason: r.reason,
          referenceDocumentType: r.referenceDocumentType,
          referenceDocumentId: r.referenceDocumentId,
          balanceAfter: Number(r.balanceAfter),
          createdAt: r.createdAt,
          createdByUserId: r.createdByUserId,
          createdByUsername: r.createdByUser?.username,
        })
    );

    return { items, total };
  }

  async findById(id: string): Promise<CashMovement | null> {
    const record = await this.client.cashMovement.findUnique({
      where: { id },
      include: {
        createdByUser: true,
      },
    });

    if (!record) {
      return null;
    }

    return new CashMovement({
      id: record.id,
      movementType: record.movementType as any,
      amount: Number(record.amount),
      paymentMethod: record.paymentMethod as any,
      reason: record.reason,
      referenceDocumentType: record.referenceDocumentType,
      referenceDocumentId: record.referenceDocumentId,
      balanceAfter: Number(record.balanceAfter),
      createdAt: record.createdAt,
      createdByUserId: record.createdByUserId,
      createdByUsername: record.createdByUser?.username,
    });
  }
}
