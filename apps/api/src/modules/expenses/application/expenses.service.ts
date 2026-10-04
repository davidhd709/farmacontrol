import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import { CashService } from '../../cash/application/cash.service';
import { recordSourceBankMovement } from '../../treasury/application/record-source-bank-movement';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';
import {
  ExpenseDto,
  ExpensePaymentDto,
  CreateExpensePayload,
  CreateExpensePaymentPayload,
  CancelExpensePayload,
  ReverseExpensePaymentPayload,
  ExpenseQueryFilters,
  ExpensesSummaryDto,
  PaginatedResponse,
} from '@farmacia/contracts';
import {
  validateExpenseAmount,
  validateExpensePaymentMethod,
  validateReversalReason,
  validateUuid,
  centsToMoneyString,
  parseMoneyToCents,
} from '../domain/expense-rules';

const fullExpenseInclude = {
  category: {
    include: {
      account: {
        select: { id: true, code: true, name: true, type: true },
      },
    },
  },
  bankAccount: {
    select: { id: true, bankName: true, accountNumber: true, name: true },
  },
  createdByUser: {
    select: { id: true, username: true },
  },
  cancelledByUser: {
    select: { id: true, username: true },
  },
  payments: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      bankAccount: {
        select: { id: true, bankName: true, accountNumber: true, name: true },
      },
      createdByUser: {
        select: { id: true, username: true },
      },
      reversedByUser: {
        select: { id: true, username: true },
      },
    },
  },
} as const;

type FullExpense = Prisma.ExpenseGetPayload<{ include: typeof fullExpenseInclude }>;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly cashService: CashService,
    @Optional() private readonly accountingEngine?: AccountingEngineService,
  ) {}

  private toPaymentDto(p: any): ExpensePaymentDto {
    return {
      id: p.id,
      expenseId: p.expenseId,
      amount: p.amount.toFixed(2),
      paymentDate: p.paymentDate instanceof Date ? p.paymentDate.toISOString().slice(0, 10) : String(p.paymentDate).slice(0, 10),
      paymentMethod: p.paymentMethod,
      bankAccountId: p.bankAccountId ?? null,
      bankAccountName: p.bankAccount ? `${p.bankAccount.bankName} - ${p.bankAccount.accountNumber}` : null,
      notes: p.notes ?? null,
      createdById: p.createdById,
      createdByName: p.createdByUser?.username ?? null,
      createdAt: p.createdAt.toISOString(),
      isReversed: p.isReversed,
      reversedAt: p.reversedAt?.toISOString() ?? null,
      reversalReason: p.reversalReason ?? null,
      reversedByName: p.reversedByUser?.username ?? null,
    };
  }

  private toDto(e: FullExpense): ExpenseDto {
    return {
      id: e.id,
      categoryId: e.categoryId,
      categoryName: e.category.name,
      accountId: e.category.accountId,
      accountCode: e.category.account?.code ?? '',
      accountName: e.category.account?.name ?? '',
      description: e.description,
      beneficiary: e.beneficiary,
      documentNumber: e.documentNumber ?? null,
      amount: e.amount.toFixed(2),
      amountPaid: e.amountPaid.toFixed(2),
      balance: e.balance.toFixed(2),
      expenseDate: e.expenseDate instanceof Date ? e.expenseDate.toISOString().slice(0, 10) : String(e.expenseDate).slice(0, 10),
      dueDate: e.dueDate ? (e.dueDate instanceof Date ? e.dueDate.toISOString().slice(0, 10) : String(e.dueDate).slice(0, 10)) : null,
      paymentMethod: e.paymentMethod as any,
      status: e.status as any,
      bankAccountId: e.bankAccountId ?? null,
      bankAccountName: e.bankAccount ? `${e.bankAccount.bankName} - ${e.bankAccount.accountNumber}` : null,
      notes: e.notes ?? null,
      supportDocUrl: e.supportDocUrl ?? null,
      createdById: e.createdById,
      createdByName: e.createdByUser?.username ?? null,
      createdAt: e.createdAt.toISOString(),
      cancelledAt: e.cancelledAt?.toISOString() ?? null,
      cancellationReason: e.cancellationReason ?? null,
      cancelledByName: e.cancelledByUser?.username ?? null,
      payments: (e.payments || []).map((p) => this.toPaymentDto(p)),
    };
  }

  async createExpense(payload: CreateExpensePayload, userId: string): Promise<ExpenseDto> {
    validateUuid(payload.categoryId, 'ID de categoría de gasto');
    const category = await prisma.expenseCategory.findUnique({
      where: { id: payload.categoryId },
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true, isActive: true },
        },
      },
    });
    if (!category) {
      throw new NotFoundException('La categoría de gasto especificada no existe.');
    }
    if (!category.isActive) {
      throw new BadRequestException('La categoría de gasto seleccionada está inactiva.');
    }

    const description = payload.description?.trim();
    if (!description) {
      throw new BadRequestException('La descripción del gasto es obligatoria.');
    }

    const beneficiary = payload.beneficiary?.trim();
    if (!beneficiary) {
      throw new BadRequestException('El proveedor o tercero beneficiario es obligatorio.');
    }

    const amountCents = validateExpenseAmount(payload.amount);
    const amountStr = centsToMoneyString(amountCents);
    const method = validateExpensePaymentMethod(payload.paymentMethod);

    if (method === 'TRANSFERENCIA') {
      if (!payload.bankAccountId) {
        throw new BadRequestException('Debe seleccionar una cuenta bancaria para pago por transferencia.');
      }
      validateUuid(payload.bankAccountId, 'ID de cuenta bancaria');
    }

    if (method === 'CREDITO') {
      if (!payload.dueDate) {
        throw new BadRequestException('La fecha de vencimiento es obligatoria para gastos a crédito.');
      }
    }

    const expenseDate = new Date(payload.expenseDate || new Date().toISOString().slice(0, 10));
    const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;

    const isCredit = method === 'CREDITO';
    const status = isCredit ? 'PENDIENTE' : 'PAGADO';
    const amountPaidStr = isCredit ? '0.00' : amountStr;
    const balanceStr = isCredit ? amountStr : '0.00';

    const created = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          categoryId: payload.categoryId,
          description,
          beneficiary,
          documentNumber: payload.documentNumber?.trim() || null,
          amount: new Prisma.Decimal(amountStr),
          amountPaid: new Prisma.Decimal(amountPaidStr),
          balance: new Prisma.Decimal(balanceStr),
          expenseDate,
          dueDate,
          paymentMethod: method,
          status,
          bankAccountId: method === 'TRANSFERENCIA' ? payload.bankAccountId : null,
          notes: payload.notes?.trim() || null,
          supportDocUrl: payload.supportDocUrl?.trim() || null,
          createdById: userId,
        },
      });

      // Movimiento de tesorería inmediato si no es a crédito
      if (method === 'EFECTIVO') {
        await this.cashService.recordMovementInTransaction(tx, {
          movementType: 'EGRESO_MANUAL',
          amount: amountStr,
          paymentMethod: 'EFECTIVO',
          reason: `Gasto: ${description} (${beneficiary})`,
          referenceDocumentType: 'EXPENSE',
          referenceDocumentId: expense.id,
          createdByUserId: userId,
        });
      } else if (method === 'TRANSFERENCIA') {
        await recordSourceBankMovement(tx, {
          bankAccountId: payload.bankAccountId!,
          movementType: 'WITHDRAWAL',
          amount: amountStr,
          concept: `Gasto: ${description} (${beneficiary})`,
          referenceDocumentType: 'EXPENSE',
          referenceDocumentId: expense.id,
          createdById: userId,
        });
      }

      // Causación contable automática de partida doble
      if (this.accountingEngine) {
        await this.accountingEngine.handleExpenseCreated(
          {
            id: expense.id,
            categoryId: category.id,
            categoryAccountId: category.accountId,
            description,
            beneficiary,
            documentNumber: payload.documentNumber,
            amount: amountStr,
            paymentMethod: method,
            status,
            expenseDate,
            createdById: userId,
          },
          tx,
        );
      }

      return expense;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return this.findById(created.id);
  }

  async payExpense(expenseId: string, payload: CreateExpensePaymentPayload, userId: string): Promise<ExpenseDto> {
    validateUuid(expenseId, 'ID de gasto');
    const payCents = validateExpenseAmount(payload.amount);
    const payStr = centsToMoneyString(payCents);

    const method = payload.paymentMethod?.toUpperCase();
    if (method !== 'EFECTIVO' && method !== 'TRANSFERENCIA') {
      throw new BadRequestException('El método de pago debe ser EFECTIVO o TRANSFERENCIA.');
    }

    if (method === 'TRANSFERENCIA') {
      if (!payload.bankAccountId) {
        throw new BadRequestException('Debe seleccionar una cuenta bancaria para pago por transferencia.');
      }
      validateUuid(payload.bankAccountId, 'ID de cuenta bancaria');
    }

    const paymentDate = new Date(payload.paymentDate || new Date().toISOString().slice(0, 10));

    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; balance: Prisma.Decimal; amount_paid: Prisma.Decimal; status: string; description: string; beneficiary: string; document_number: string | null }>>`
        SELECT id, balance, amount_paid, status, description, beneficiary, document_number
        FROM expenses
        WHERE id = ${expenseId}::uuid
        FOR UPDATE
      `;
      if (!rows.length) {
        throw new NotFoundException(`Gasto con ID "${expenseId}" no encontrado.`);
      }
      const exp = rows[0];

      if (exp.status === 'ANULADO') {
        throw new BadRequestException('No se pueden registrar pagos a un gasto anulado.');
      }
      if (exp.status === 'PAGADO') {
        throw new BadRequestException('Este gasto ya se encuentra totalmente pagado.');
      }

      const balanceCents = parseMoneyToCents(exp.balance.toString(), 'Saldo de gasto');
      if (payCents > balanceCents) {
        throw new BadRequestException(
          `El monto a pagar ($${payStr}) no puede ser mayor al saldo pendiente actual ($${centsToMoneyString(balanceCents)}).`,
        );
      }

      const newBalanceCents = balanceCents - payCents;
      const newAmountPaidCents = parseMoneyToCents(exp.amount_paid.toString(), 'Monto pagado') + payCents;
      const newStatus = newBalanceCents === 0n ? 'PAGADO' : 'PENDIENTE';

      const payment = await tx.expensePayment.create({
        data: {
          expenseId,
          amount: new Prisma.Decimal(payStr),
          paymentDate,
          paymentMethod: method,
          bankAccountId: method === 'TRANSFERENCIA' ? payload.bankAccountId : null,
          notes: payload.notes?.trim() || null,
          createdById: userId,
        },
      });

      await tx.expense.update({
        where: { id: expenseId },
        data: {
          balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
          amountPaid: new Prisma.Decimal(centsToMoneyString(newAmountPaidCents)),
          status: newStatus,
        },
      });

      // Movimiento de tesorería
      if (method === 'EFECTIVO') {
        await this.cashService.recordMovementInTransaction(tx, {
          movementType: 'EGRESO_MANUAL',
          amount: payStr,
          paymentMethod: 'EFECTIVO',
          reason: `Abono gasto: ${exp.description} (${exp.beneficiary})`,
          referenceDocumentType: 'EXPENSE_PAYMENT',
          referenceDocumentId: payment.id,
          createdByUserId: userId,
        });
      } else {
        await recordSourceBankMovement(tx, {
          bankAccountId: payload.bankAccountId!,
          movementType: 'WITHDRAWAL',
          amount: payStr,
          concept: `Abono gasto: ${exp.description} (${exp.beneficiary})`,
          referenceDocumentType: 'EXPENSE_PAYMENT',
          referenceDocumentId: payment.id,
          createdById: userId,
        });
      }

      // Causación contable del pago: debita SUPPLIERS y acredita CASH o BANK
      if (this.accountingEngine) {
        await this.accountingEngine.handleExpensePayment(
          {
            id: payment.id,
            expenseId,
            amount: payStr,
            paymentMethod: method,
            beneficiary: exp.beneficiary,
            description: exp.description,
            documentNumber: exp.document_number,
            createdById: userId,
            paymentDate,
          },
          tx,
        );
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return this.findById(expenseId);
  }

  async cancelExpense(expenseId: string, payload: CancelExpensePayload, userId: string): Promise<ExpenseDto> {
    validateUuid(expenseId, 'ID de gasto');
    const reason = validateReversalReason(payload.cancellationReason);

    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; payment_method: string; amount: Prisma.Decimal; bank_account_id: string | null; description: string; beneficiary: string }>>`
        SELECT id, status, payment_method, amount, bank_account_id, description, beneficiary
        FROM expenses
        WHERE id = ${expenseId}::uuid
        FOR UPDATE
      `;
      if (!rows.length) throw new NotFoundException(`Gasto con ID "${expenseId}" no encontrado.`);
      const exp = rows[0];

      if (exp.status === 'ANULADO') {
        throw new BadRequestException('El gasto ya se encuentra anulado.');
      }

      // Si tiene pagos registrados, exigir revertir los pagos primero
      const activePayments = await tx.expensePayment.count({
        where: { expenseId, isReversed: false },
      });
      if (activePayments > 0) {
        throw new BadRequestException(
          'No se puede anular un gasto con pagos activos. Debe revertir los pagos individuales primero.',
        );
      }

      await tx.expense.update({
        where: { id: expenseId },
        data: {
          status: 'ANULADO',
          cancelledAt: new Date(),
          cancellationReason: reason,
          cancelledById: userId,
        },
      });

      // Si fue pagado de contado al inicio, devolver los fondos a tesorería
      if (exp.payment_method === 'EFECTIVO' && exp.status === 'PAGADO') {
        await this.cashService.recordMovementInTransaction(tx, {
          movementType: 'INGRESO_MANUAL',
          amount: exp.amount.toFixed(2),
          paymentMethod: 'EFECTIVO',
          reason: `Reversión por anulación de gasto: ${exp.description} - Motivo: ${reason}`,
          referenceDocumentType: 'EXPENSE_CANCEL',
          referenceDocumentId: expenseId,
          createdByUserId: userId,
        });
      } else if (exp.payment_method === 'TRANSFERENCIA' && exp.status === 'PAGADO' && exp.bank_account_id) {
        await recordSourceBankMovement(tx, {
          bankAccountId: exp.bank_account_id,
          movementType: 'DEPOSIT',
          amount: exp.amount.toFixed(2),
          concept: `Reversión por anulación de gasto: ${exp.description} - Motivo: ${reason}`,
          referenceDocumentType: 'EXPENSE_CANCEL',
          referenceDocumentId: expenseId,
          createdById: userId,
        });
      }

      // Reversar asiento contable
      if (this.accountingEngine) {
        await this.accountingEngine.handleExpenseCancelled(expenseId, reason, userId, tx);
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return this.findById(expenseId);
  }

  async reversePayment(paymentId: string, payload: ReverseExpensePaymentPayload, userId: string): Promise<ExpenseDto> {
    validateUuid(paymentId, 'ID de pago de gasto');
    const reason = validateReversalReason(payload.reversalReason);

    let expenseId = '';

    await prisma.$transaction(async (tx) => {
      const payment = await tx.expensePayment.findUnique({
        where: { id: paymentId },
        include: { expense: true },
      });
      if (!payment) throw new NotFoundException(`Pago de gasto con ID "${paymentId}" no encontrado.`);
      if (payment.isReversed) throw new BadRequestException('Este pago ya fue revertido previamente.');

      expenseId = payment.expenseId;

      await tx.expensePayment.update({
        where: { id: paymentId },
        data: {
          isReversed: true,
          reversedAt: new Date(),
          reversalReason: reason,
          reversedById: userId,
        },
      });

      // Restituir saldo en el gasto
      const payCents = parseMoneyToCents(payment.amount.toString(), 'Monto a revertir');
      const currentBalanceCents = parseMoneyToCents(payment.expense.balance.toString(), 'Saldo actual');
      const currentPaidCents = parseMoneyToCents(payment.expense.amountPaid.toString(), 'Monto pagado actual');

      const newBalanceCents = currentBalanceCents + payCents;
      const newPaidCents = currentPaidCents - payCents;

      await tx.expense.update({
        where: { id: expenseId },
        data: {
          balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
          amountPaid: new Prisma.Decimal(centsToMoneyString(newPaidCents)),
          status: 'PENDIENTE',
        },
      });

      // Devolver fondos a tesorería
      if (payment.paymentMethod === 'EFECTIVO') {
        await this.cashService.recordMovementInTransaction(tx, {
          movementType: 'INGRESO_MANUAL',
          amount: payment.amount.toFixed(2),
          paymentMethod: 'EFECTIVO',
          reason: `Reversión de pago de gasto #${paymentId} - Motivo: ${reason}`,
          referenceDocumentType: 'EXPENSE_PAYMENT_REVERSAL',
          referenceDocumentId: paymentId,
          createdByUserId: userId,
        });
      } else if (payment.paymentMethod === 'TRANSFERENCIA' && payment.bankAccountId) {
        await recordSourceBankMovement(tx, {
          bankAccountId: payment.bankAccountId,
          movementType: 'DEPOSIT',
          amount: payment.amount.toFixed(2),
          concept: `Reversión de pago de gasto #${paymentId} - Motivo: ${reason}`,
          referenceDocumentType: 'EXPENSE_PAYMENT_REVERSAL',
          referenceDocumentId: paymentId,
          createdById: userId,
        });
      }

      // Reversar asiento contable del pago
      if (this.accountingEngine) {
        await this.accountingEngine.handleExpensePaymentReversed(paymentId, reason, userId, tx);
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return this.findById(expenseId);
  }

  async findById(id: string): Promise<ExpenseDto> {
    validateUuid(id, 'ID de gasto');
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: fullExpenseInclude,
    });
    if (!expense) throw new NotFoundException(`Gasto con ID "${id}" no encontrado.`);
    return this.toDto(expense);
  }

  async findAll(filters: ExpenseQueryFilters = {}): Promise<PaginatedResponse<ExpenseDto>> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {};

    if (filters.categoryId) {
      validateUuid(filters.categoryId, 'ID de categoría');
      where.categoryId = filters.categoryId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.paymentMethod) {
      where.paymentMethod = filters.paymentMethod;
    }

    if (filters.startDate || filters.endDate) {
      where.expenseDate = {};
      if (filters.startDate) where.expenseDate.gte = new Date(filters.startDate);
      if (filters.endDate) where.expenseDate.lte = new Date(filters.endDate);
    }

    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { beneficiary: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { documentNumber: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        include: fullExpenseInclude,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.toDto(r)),
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSummary(filters: ExpenseQueryFilters = {}): Promise<ExpensesSummaryDto> {
    const where: Prisma.ExpenseWhereInput = {};

    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.status) where.status = filters.status;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

    if (filters.startDate || filters.endDate) {
      where.expenseDate = {};
      if (filters.startDate) where.expenseDate.gte = new Date(filters.startDate);
      if (filters.endDate) where.expenseDate.lte = new Date(filters.endDate);
    }

    const expenses = await prisma.expense.findMany({
      where,
      select: {
        amount: true,
        amountPaid: true,
        balance: true,
        status: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
      },
    });

    let totalAmountCents = 0n;
    let totalPaidCents = 0n;
    let totalPendingCents = 0n;

    const catMap = new Map<string, { categoryId: string; categoryName: string; amountCents: bigint; count: number }>();

    for (const e of expenses) {
      if (e.status === 'ANULADO') continue;

      const amt = parseMoneyToCents(e.amount.toString(), 'Monto gasto');
      const paid = parseMoneyToCents(e.amountPaid.toString(), 'Monto pagado');
      const bal = parseMoneyToCents(e.balance.toString(), 'Saldo');

      totalAmountCents += amt;
      totalPaidCents += paid;
      totalPendingCents += bal;

      const existingCat = catMap.get(e.categoryId);
      if (existingCat) {
        existingCat.amountCents += amt;
        existingCat.count += 1;
      } else {
        catMap.set(e.categoryId, {
          categoryId: e.categoryId,
          categoryName: e.category.name,
          amountCents: amt,
          count: 1,
        });
      }
    }

    return {
      totalAmount: centsToMoneyString(totalAmountCents),
      totalPaid: centsToMoneyString(totalPaidCents),
      totalPending: centsToMoneyString(totalPendingCents),
      count: expenses.filter((e) => e.status !== 'ANULADO').length,
      categoriesBreakdown: Array.from(catMap.values()).map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        amount: centsToMoneyString(c.amountCents),
        count: c.count,
      })),
    };
  }
}
