import { businessToday } from '../../../common/utils/business-date';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import { CashService } from '../../cash/application/cash.service';
import { recordSourceBankMovement } from '../../treasury/application/record-source-bank-movement';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';
import {
  ExpenseDto,
  ExpensePaymentDto,
  CreateExpensePayload,
  CancelExpensePayload,
  ReverseExpensePaymentPayload,
  ExpenseQueryFilters,
  ExpensesSummaryDto,
  ExpenseMovementsDto,
  ExpenseWithoutSupplierDto,
  PaginatedResponse,
} from '@farmacia/contracts';
import { buildDocumentMovements, RawDocumentMovement } from '../../../common/utils/document-movements';
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
  supplier: { select: { name: true } },
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
  // Registrar un gasto o su pago mueve dinero o causa una cuenta por pagar: un reintento
  // con la misma clave devuelve el resultado original en lugar de duplicarlo (AGENTS.md §6).
  private readonly idempotencyService = new IdempotencyService();

  constructor(
    private readonly cashService: CashService,
    private readonly accountingEngine: AccountingEngineService,
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
      supplierId: e.supplierId ?? null,
      supplierName: e.supplier?.name ?? null,
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

  async createExpense(
    payload: CreateExpensePayload,
    userId: string,
    idempotencyKey?: string,
  ): Promise<ExpenseDto> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key es obligatorio para registrar un gasto.');
    }
    validateUuid(payload.categoryId, 'ID de categoría de gasto');
    const description = payload.description?.trim();
    if (!description) {
      throw new BadRequestException('La descripción del gasto es obligatoria.');
    }

    // La deuda nace con su proveedor: así aparece en su estado de cuenta y se paga con egreso
    if (!payload.supplierId) {
      throw new BadRequestException(
        'Selecciona el proveedor de la causación: la cuenta por pagar se paga con un comprobante de egreso a su nombre.',
      );
    }
    validateUuid(payload.supplierId, 'ID de proveedor');

    const amountCents = validateExpenseAmount(payload.amount);
    const amountStr = centsToMoneyString(amountCents);
    // La causación reconoce el gasto y la cuenta por pagar; el pago es un comprobante de egreso
    const method = validateExpensePaymentMethod(payload.paymentMethod ?? 'CREDITO');
    if (method !== 'CREDITO' || payload.bankAccountId) {
      throw new BadRequestException(
        'La causación de gasto solo reconoce el gasto y la cuenta por pagar; el pago se registra con un comprobante de egreso.',
      );
    }

    const expenseDate = new Date(payload.expenseDate || businessToday());
    const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
    if (dueDate && dueDate < expenseDate) {
      throw new BadRequestException('El vencimiento no puede ser anterior a la fecha del gasto.');
    }
    const status = 'PENDIENTE';

    const endpoint = '/api/v1/expenses';
    const requestHash = this.idempotencyService.computeHash(endpoint, userId, payload);
    const key = idempotencyKey!;

    const createIdempotently = () => this.idempotencyService.retryOnSerialization(() => prisma.$transaction(async (tx) => {
      const cached = await this.idempotencyService.getRecord(key, requestHash, tx, 'http');
      if (cached) return cached.responseBody as ExpenseDto;

      const category = await tx.expenseCategory.findUnique({
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
      const supplier = await tx.supplier.findUnique({
        where: { id: payload.supplierId },
        select: { name: true },
      });
      if (!supplier) {
        throw new NotFoundException('El proveedor de la causación no existe.');
      }
      const beneficiary = supplier.name;

      const expense = await tx.expense.create({
        data: {
          categoryId: payload.categoryId,
          description,
          beneficiary,
          documentNumber: payload.documentNumber?.trim() || null,
          amount: new Prisma.Decimal(amountStr),
          amountPaid: new Prisma.Decimal('0.00'),
          balance: new Prisma.Decimal(amountStr),
          expenseDate,
          dueDate,
          paymentMethod: method,
          status,
          supplierId: payload.supplierId,
          bankAccountId: null,
          notes: payload.notes?.trim() || null,
          supportDocUrl: payload.supportDocUrl?.trim() || null,
          createdById: userId,
        },
      });

      // Causación contable automática de partida doble
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
          bankAccountId: null,
          status,
          expenseDate,
          createdById: userId,
        },
        tx,
      );

      await tx.auditEvent.create({
        data: {
          userId,
          action: 'expenses:expense_created',
          entity: 'Expense',
          entityId: expense.id,
          details: {
            amount: amountStr,
            paymentMethod: method,
            categoryId: category.id,
            beneficiary,
            supplierId: payload.supplierId ?? null,
          },
        },
      });

      const record = await tx.expense.findUnique({
        where: { id: expense.id },
        include: fullExpenseInclude,
      });
      if (!record) throw new Error('No fue posible recuperar el gasto recién registrado.');
      const response = this.toDto(record);

      await this.idempotencyService.saveRecord(
        { key, endpoint, requestHash, userId, responseStatus: 201, responseBody: response },
        tx,
      );
      return response;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }));

    // Under SERIALIZABLE, a transaction waiting on the advisory lock may retain
    // a snapshot that predates the winning request. Its final idempotency insert
    // can therefore lose on the unique key. The failed transaction is rolled
    // back; retrying the whole operation in a fresh transaction reads and
    // replays the winner's stored response. Only retry this specific key clash.
    for (let attempt = 0; ; attempt++) {
      try {
        return await createIdempotently();
      } catch (error) {
        const target =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
            ? error.meta?.target
            : undefined;
        const isIdempotencyKeyCollision =
          (Array.isArray(target) && target.some((field) => field === 'key')) ||
          (typeof target === 'string' && /idempotency.*key|key.*idempotency/i.test(target));
        if (!isIdempotencyKeyCollision || attempt >= 2) throw error;
      }
    }

  }

  /**
   * Aplica un pago a una causación de gasto dentro de la transacción del llamador: bloquea el
   * gasto, valida estado, saldo y proveedor, actualiza saldos, registra el pago, su asiento
   * (cancela el pasivo contra caja o bancos) y su auditoría. El movimiento de dinero lo
   * registra el comprobante de egreso que respalda el pago.
   */
  async applyPaymentInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      expenseId: string;
      amountCents: bigint;
      paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA';
      bankAccountId: string | null;
      paymentDate: Date;
      notes: string | null;
      userId: string;
      treasuryDocumentId?: string;
      /** Proveedor del egreso: la causación debe ser suya */
      expectedSupplierId?: string;
    },
  ): Promise<{ paymentId: string; description: string; beneficiary: string; documentNumber: string | null }> {
    const payStr = centsToMoneyString(input.amountCents);
    const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal; amount_paid: Prisma.Decimal; status: string; description: string; beneficiary: string; document_number: string | null; supplier_id: string | null }>>`
      SELECT balance, amount_paid, status, description, beneficiary, document_number, supplier_id
      FROM expenses
      WHERE id = ${input.expenseId}::uuid
      FOR UPDATE
    `;
    if (!rows.length) {
      throw new NotFoundException(`Gasto con ID "${input.expenseId}" no encontrado.`);
    }
    const exp = rows[0];
    if (input.expectedSupplierId && exp.supplier_id !== input.expectedSupplierId) {
      throw new BadRequestException('La causación seleccionada no pertenece al proveedor del egreso.');
    }
    if (exp.status === 'ANULADO') {
      throw new BadRequestException('No se pueden registrar pagos a un gasto anulado.');
    }
    if (exp.status === 'PAGADO') {
      throw new BadRequestException('Este gasto ya se encuentra totalmente pagado.');
    }
    const balanceCents = parseMoneyToCents(exp.balance.toString(), 'Saldo de gasto');
    if (input.amountCents > balanceCents) {
      throw new BadRequestException(
        `El monto a pagar ($${payStr}) no puede ser mayor al saldo pendiente actual ($${centsToMoneyString(balanceCents)}).`,
      );
    }
    const newBalanceCents = balanceCents - input.amountCents;
    const newAmountPaidCents = parseMoneyToCents(exp.amount_paid.toString(), 'Monto pagado') + input.amountCents;
    const newStatus = newBalanceCents === 0n ? 'PAGADO' : 'PENDIENTE';

    const payment = await tx.expensePayment.create({
      data: {
        expenseId: input.expenseId,
        amount: new Prisma.Decimal(payStr),
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        bankAccountId: input.paymentMethod === 'TRANSFERENCIA' ? input.bankAccountId : null,
        notes: input.notes,
        createdById: input.userId,
        treasuryDocumentId: input.treasuryDocumentId ?? null,
      },
    });
    await tx.expense.update({
      where: { id: input.expenseId },
      data: {
        balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
        amountPaid: new Prisma.Decimal(centsToMoneyString(newAmountPaidCents)),
        status: newStatus,
      },
    });
    // Causación contable del pago: debita SUPPLIERS y acredita CASH o BANK
    await this.accountingEngine.handleExpensePayment(
      {
        id: payment.id,
        expenseId: input.expenseId,
        amount: payStr,
        paymentMethod: input.paymentMethod,
        bankAccountId: input.paymentMethod === 'TRANSFERENCIA' ? input.bankAccountId : null,
        beneficiary: exp.beneficiary,
        description: exp.description,
        documentNumber: exp.document_number,
        createdById: input.userId,
        paymentDate: input.paymentDate,
      },
      tx,
    );
    await tx.auditEvent.create({
      data: {
        userId: input.userId,
        action: 'expenses:expense_payment_registered',
        entity: 'ExpensePayment',
        entityId: payment.id,
        details: {
          expenseId: input.expenseId,
          amount: payStr,
          paymentMethod: input.paymentMethod,
          balanceBefore: exp.balance.toFixed(2),
          balanceAfter: centsToMoneyString(newBalanceCents),
          treasuryDocumentId: input.treasuryDocumentId ?? null,
        },
      },
    });
    return {
      paymentId: payment.id,
      description: exp.description,
      beneficiary: exp.beneficiary,
      documentNumber: exp.document_number,
    };
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
      await this.accountingEngine.handleExpenseCancelled(expenseId, reason, userId, tx);
      await tx.auditEvent.create({
        data: {
          userId,
          action: 'expenses:expense_cancelled',
          entity: 'Expense',
          entityId: expenseId,
          details: { reason, amount: exp.amount.toFixed(2) },
        },
      });
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
      await this.accountingEngine.handleExpensePaymentReversed(paymentId, reason, userId, tx);
      await tx.auditEvent.create({
        data: {
          userId,
          action: 'expenses:expense_payment_reversed',
          entity: 'ExpensePayment',
          entityId: paymentId,
          details: {
            expenseId,
            amount: payment.amount.toFixed(2),
            paymentMethod: payment.paymentMethod,
            reason,
          },
        },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    return this.findById(expenseId);
  }

  /**
   * Causaciones sin proveedor (anteriores a que fuera obligatorio): no aparecen en ningún estado
   * de cuenta ni se pueden pagar con un comprobante de egreso hasta asignarles uno.
   */
  async listWithoutSupplier(filters: { fromDate?: string; toDate?: string }): Promise<ExpenseWithoutSupplierDto[]> {
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      throw new BadRequestException('La fecha desde no puede ser posterior a la fecha hasta.');
    }
    const rows = await prisma.expense.findMany({
      where: {
        supplierId: null,
        status: { not: 'ANULADO' },
        ...(filters.fromDate || filters.toDate
          ? {
              expenseDate: {
                ...(filters.fromDate ? { gte: new Date(`${filters.fromDate}T00:00:00Z`) } : {}),
                ...(filters.toDate ? { lte: new Date(`${filters.toDate}T00:00:00Z`) } : {}),
              },
            }
          : {}),
      },
      include: { category: { select: { name: true } } },
      orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((e) => ({
      id: e.id,
      expenseDate: e.expenseDate.toISOString().slice(0, 10),
      documentNumber: e.documentNumber ?? null,
      description: e.description,
      beneficiary: e.beneficiary,
      categoryName: e.category.name,
      amount: e.amount.toFixed(2),
      balance: e.balance.toFixed(2),
      status: e.status as ExpenseWithoutSupplierDto['status'],
    }));
  }

  /**
   * Asigna manualmente el proveedor de una causación que no lo tiene. No reasigna: una causación
   * con proveedor responde 409. Queda en auditoría quién lo asignó, cuándo y el beneficiario que
   * tenía registrado.
   */
  async assignSupplier(expenseId: string, supplierId: unknown, userId: string): Promise<ExpenseDto> {
    validateUuid(expenseId, 'ID de gasto');
    if (typeof supplierId !== 'string') throw new BadRequestException('El proveedor es obligatorio.');
    validateUuid(supplierId, 'ID de proveedor');
    await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ supplier_id: string | null; status: string; beneficiary: string }>>`
          SELECT supplier_id, status, beneficiary FROM expenses WHERE id = ${expenseId}::uuid FOR UPDATE
        `;
        if (!rows.length) throw new NotFoundException(`Gasto con ID "${expenseId}" no encontrado.`);
        if (rows[0].status === 'ANULADO') {
          throw new BadRequestException('Una causación anulada no admite cambios.');
        }
        if (rows[0].supplier_id) {
          throw new ConflictException('La causación ya tiene proveedor; no se reasigna.');
        }
        const supplier = await tx.supplier.findUnique({ where: { id: supplierId }, select: { name: true } });
        if (!supplier) throw new NotFoundException('El proveedor no existe.');
        await tx.expense.update({ where: { id: expenseId }, data: { supplierId } });
        await tx.auditEvent.create({
          data: {
            userId,
            action: 'expenses:supplier_assigned',
            entity: 'Expense',
            entityId: expenseId,
            details: {
              supplierId,
              supplierName: supplier.name,
              previousBeneficiary: rows[0].beneficiary,
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.findById(expenseId);
  }

  /** Movimientos de una causación: el pasivo, cada pago con su comprobante de egreso y saldo. */
  async getMovements(id: string): Promise<ExpenseMovementsDto> {
    validateUuid(id, 'ID de gasto');
    const e = await prisma.expense.findUnique({
      where: { id },
      include: {
        supplier: { select: { name: true } },
        payments: { include: { treasuryDocument: { select: { documentNumber: true } } } },
      },
    });
    if (!e) throw new NotFoundException(`Gasto con ID "${id}" no encontrado.`);
    const toCents = (value: Prisma.Decimal) => parseMoneyToCents(value.toFixed(2), 'Valor');
    const raw: RawDocumentMovement[] = [
      {
        at: e.createdAt,
        type: 'CARGO',
        documentNumber: e.documentNumber ?? null,
        description: `Causación: ${e.description}`,
        deltaCents: toCents(e.amount),
      },
    ];
    for (const p of e.payments) {
      raw.push({
        at: p.createdAt,
        type: 'ABONO',
        documentNumber: p.treasuryDocument?.documentNumber ?? null,
        description: p.notes || 'Pago de la causación',
        paymentMethod: p.paymentMethod,
        paymentId: p.id,
        isReversed: p.isReversed,
        deltaCents: -toCents(p.amount),
      });
      if (p.isReversed && p.reversedAt) {
        raw.push({
          at: p.reversedAt,
          type: 'REVERSION_ABONO',
          documentNumber: null,
          description: `Reversión del pago: ${p.reversalReason ?? ''}`.trim(),
          paymentMethod: p.paymentMethod,
          deltaCents: toCents(p.amount),
        });
      }
    }
    const pendingCents = raw.reduce((acc, m) => acc + m.deltaCents, 0n);
    if (e.status === 'ANULADO' && e.cancelledAt && pendingCents > 0n) {
      raw.push({
        at: e.cancelledAt,
        type: 'ANULACION',
        documentNumber: e.documentNumber ?? null,
        description: e.cancellationReason ?? 'Causación anulada',
        deltaCents: -pendingCents,
      });
    }
    return {
      expenseId: e.id,
      documentNumber: e.documentNumber ?? null,
      description: e.description,
      supplierName: e.supplier?.name ?? e.beneficiary,
      totalAmount: e.amount.toFixed(2),
      amountPaid: e.amountPaid.toFixed(2),
      balance: e.balance.toFixed(2),
      status: e.status,
      dueDate: e.dueDate ? e.dueDate.toISOString().slice(0, 10) : null,
      movements: buildDocumentMovements(raw),
    };
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
