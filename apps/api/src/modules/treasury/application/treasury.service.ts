import { Injectable } from '@nestjs/common';
import { Prisma, prisma, type BankAccount, type BankMovement } from '@farmacia/database';
import type {
  BankAccountDto,
  BankAccountOptionDto,
  BankAccountsSummaryDto,
  BankMovementDto,
  CreateBankAccountDto,
  CreateBankMovementDto,
  UpdateBankAccountDto,
} from '@farmacia/contracts';
import {
  centsToMoneyString,
  calculateNewBalanceCents,
  parseMoneyToCents,
  TreasuryConflictError,
  TreasuryNotFoundError,
  TreasuryValidationError,
  validateAccountName,
  validateAccountNumber,
  validateAccountType,
  validateBankName,
  validateConcept,
  validateUuid,
} from '../domain/treasury-rules';

export interface MovementFilter {
  fromDate?: string;
  toDate?: string;
  movementType?: string;
  search?: string;
  page?: number;
  limit?: number;
}

function mapAccountToDto(account: BankAccount): BankAccountDto {
  return {
    id: account.id,
    bankName: account.bankName,
    accountType: account.accountType as BankAccountDto['accountType'],
    accountNumber: account.accountNumber,
    name: account.name,
    initialBalance: account.initialBalance.toFixed(2),
    currentBalance: account.currentBalance.toFixed(2),
    currency: account.currency,
    isActive: account.isActive,
    notes: account.notes,
    createdById: account.createdById,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

function mapMovementToDto(movement: BankMovement): BankMovementDto {
  return {
    id: movement.id,
    bankAccountId: movement.bankAccountId,
    movementType: movement.movementType as BankMovementDto['movementType'],
    amount: movement.amount.toFixed(2),
    balanceBefore: movement.balanceBefore.toFixed(2),
    balanceAfter: movement.balanceAfter.toFixed(2),
    concept: movement.concept,
    referenceDocumentType: movement.referenceDocumentType,
    referenceDocumentId: movement.referenceDocumentId,
    externalReference: movement.externalReference,
    movementDate: movement.movementDate.toISOString(),
    createdById: movement.createdById,
    createdAt: movement.createdAt.toISOString(),
  };
}

@Injectable()
export class TreasuryService {
  async listAccountOptions(): Promise<BankAccountOptionDto[]> {
    const accounts = await prisma.bankAccount.findMany({
      where: { isActive: true },
      select: { id: true, name: true, bankName: true, accountNumber: true },
      orderBy: [{ bankName: 'asc' }, { name: 'asc' }],
    });
    return accounts.map((account) => ({
      id: account.id,
      name: account.name,
      bankName: account.bankName,
      accountNumberLast4: account.accountNumber.length >= 8 ? account.accountNumber.slice(-4) : '',
    }));
  }

  async createAccount(dto: CreateBankAccountDto, userId: string): Promise<BankAccountDto> {
    const bankName = validateBankName(dto.bankName);
    const accountType = validateAccountType(dto.accountType);
    const accountNumber = validateAccountNumber(dto.accountNumber);
    const name = validateAccountName(dto.name);
    const initialBalanceStr = dto.initialBalance ?? '0.00';
    const initialBalanceCents = parseMoneyToCents(initialBalanceStr, 'Saldo inicial');
    const notes = typeof dto.notes === 'string' ? dto.notes.trim() || null : null;

    const existing = await prisma.bankAccount.findUnique({
      where: {
        bankName_accountNumber: {
          bankName,
          accountNumber,
        },
      },
    });

    if (existing) {
      throw new TreasuryConflictError(
        `Ya existe una cuenta bancaria registrada para '${bankName}' con el número '${accountNumber}'.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const initialBalanceDecimal = new Prisma.Decimal(centsToMoneyString(initialBalanceCents));
      const created = await tx.bankAccount.create({
        data: {
          bankName,
          accountType,
          accountNumber,
          name,
          initialBalance: initialBalanceDecimal,
          currentBalance: initialBalanceDecimal,
          currency: 'COP',
          isActive: true,
          notes,
          createdById: userId,
        },
      });

      if (initialBalanceCents > 0n) {
        await tx.bankMovement.create({
          data: {
            bankAccountId: created.id,
            movementType: 'DEPOSIT',
            amount: initialBalanceDecimal,
            balanceBefore: new Prisma.Decimal('0.00'),
            balanceAfter: initialBalanceDecimal,
            concept: 'Saldo inicial de apertura de cuenta',
            referenceDocumentType: 'INITIAL_BALANCE',
            createdById: userId,
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          action: 'treasury:bank_account_created',
          entity: 'BankAccount',
          entityId: created.id,
          userId,
          details: {
            bankName,
            accountType,
            accountNumber,
            name,
            initialBalance: centsToMoneyString(initialBalanceCents),
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return mapAccountToDto(created);
    });
  }

  async listAccounts(includeInactive = false): Promise<BankAccountDto[]> {
    const accounts = await prisma.bankAccount.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { bankName: 'asc' }, { name: 'asc' }],
    });
    return accounts.map(mapAccountToDto);
  }

  async getAccount(id: string): Promise<BankAccountDto> {
    validateUuid(id, 'ID de cuenta bancaria');
    const account = await prisma.bankAccount.findUnique({
      where: { id },
    });
    if (!account) {
      throw new TreasuryNotFoundError('Cuenta bancaria no encontrada.');
    }
    return mapAccountToDto(account);
  }

  async updateAccount(
    id: string,
    dto: UpdateBankAccountDto,
    userId: string,
  ): Promise<BankAccountDto> {
    validateUuid(id, 'ID de cuenta bancaria');
    const current = await prisma.bankAccount.findUnique({ where: { id } });
    if (!current) {
      throw new TreasuryNotFoundError('Cuenta bancaria no encontrada.');
    }

    const data: Prisma.BankAccountUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = validateAccountName(dto.name);
    }
    if (dto.notes !== undefined) {
      data.notes = typeof dto.notes === 'string' ? dto.notes.trim() || null : null;
    }
    if (dto.isActive !== undefined) {
      if (typeof dto.isActive !== 'boolean') {
        throw new TreasuryValidationError('isActive debe ser un valor booleano.');
      }
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new TreasuryValidationError('No se especificaron campos válidos para actualizar.');
    }

    const updated = await prisma.bankAccount.update({
      where: { id },
      data,
    });

    await prisma.auditEvent.create({
      data: {
        action: 'treasury:bank_account_updated',
        entity: 'BankAccount',
        entityId: id,
        userId,
        details: {
          before: { name: current.name, isActive: current.isActive, notes: current.notes },
          after: { name: updated.name, isActive: updated.isActive, notes: updated.notes },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return mapAccountToDto(updated);
  }

  async getSummary(): Promise<BankAccountsSummaryDto> {
    const accounts = await prisma.bankAccount.findMany();
    let totalCents = 0n;
    let activeCount = 0;

    for (const acc of accounts) {
      if (acc.isActive) {
        activeCount++;
        totalCents += parseMoneyToCents(acc.currentBalance.toFixed(2), 'Saldo');
      }
    }

    return {
      totalBalance: centsToMoneyString(totalCents),
      activeAccountsCount: activeCount,
      totalAccountsCount: accounts.length,
      currency: 'COP',
    };
  }

  async createMovement(
    accountId: string,
    dto: CreateBankMovementDto,
    userId: string,
  ): Promise<BankMovementDto> {
    validateUuid(accountId, 'ID de cuenta bancaria');
    const concept = validateConcept(dto.concept);
    const amountCents = parseMoneyToCents(dto.amount, 'Importe del movimiento');
    const movementType = dto.movementType;
    const externalReference =
      typeof dto.externalReference === 'string' ? dto.externalReference.trim() || null : null;
    const referenceDocumentType =
      typeof dto.referenceDocumentType === 'string' ? dto.referenceDocumentType.trim() || null : null;
    const referenceDocumentId =
      typeof dto.referenceDocumentId === 'string' ? dto.referenceDocumentId.trim() || null : null;

    let movementDate = new Date();
    if (dto.movementDate) {
      const parsedDate = new Date(dto.movementDate);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new TreasuryValidationError('Fecha de movimiento inválida.');
      }
      movementDate = parsedDate;
    }

    return prisma.$transaction(
      async (tx) => {
        // Obtenemos la cuenta con bloqueo exclusivo a nivel de fila
        const rows = await tx.$queryRaw<Array<{ id: string; current_balance: Prisma.Decimal; is_active: boolean }>>`
          SELECT id, current_balance, is_active
          FROM bank_accounts
          WHERE id = ${accountId}::uuid
          FOR UPDATE
        `;

        const locked = rows[0];
        if (!locked) {
          throw new TreasuryNotFoundError('Cuenta bancaria no encontrada.');
        }
        if (!locked.is_active) {
          throw new TreasuryValidationError('No se pueden registrar movimientos en una cuenta bancaria inactiva.');
        }

        const currentBalanceCents = parseMoneyToCents(
          locked.current_balance.toString(),
          'Saldo actual',
        );

        const { balanceBefore, balanceAfter } = calculateNewBalanceCents(
          currentBalanceCents,
          movementType,
          amountCents,
          false,
        );

        const balanceBeforeDec = new Prisma.Decimal(centsToMoneyString(balanceBefore));
        const balanceAfterDec = new Prisma.Decimal(centsToMoneyString(balanceAfter));
        const amountDec = new Prisma.Decimal(centsToMoneyString(amountCents));

        await tx.bankAccount.update({
          where: { id: accountId },
          data: {
            currentBalance: balanceAfterDec,
          },
        });

        const movement = await tx.bankMovement.create({
          data: {
            bankAccountId: accountId,
            movementType,
            amount: amountDec,
            balanceBefore: balanceBeforeDec,
            balanceAfter: balanceAfterDec,
            concept,
            referenceDocumentType,
            referenceDocumentId,
            externalReference,
            movementDate,
            createdById: userId,
          },
        });

        await tx.auditEvent.create({
          data: {
            action: 'treasury:bank_movement_created',
            entity: 'BankMovement',
            entityId: movement.id,
            userId,
            details: {
              bankAccountId: accountId,
              movementType,
              amount: centsToMoneyString(amountCents),
              balanceBefore: centsToMoneyString(balanceBefore),
              balanceAfter: centsToMoneyString(balanceAfter),
              concept,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        return mapMovementToDto(movement);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }

  async listMovements(
    accountId: string,
    filter: MovementFilter = {},
  ): Promise<{ items: BankMovementDto[]; total: number }> {
    validateUuid(accountId, 'ID de cuenta bancaria');

    const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new TreasuryNotFoundError('Cuenta bancaria no encontrada.');
    }

    const where: Prisma.BankMovementWhereInput = {
      bankAccountId: accountId,
    };

    if (filter.movementType) {
      where.movementType = filter.movementType;
    }

    if (filter.fromDate || filter.toDate) {
      where.movementDate = {};
      if (filter.fromDate) {
        const from = new Date(filter.fromDate);
        if (!Number.isNaN(from.getTime())) {
          where.movementDate.gte = from;
        }
      }
      if (filter.toDate) {
        const to = new Date(filter.toDate);
        if (!Number.isNaN(to.getTime())) {
          if (typeof filter.toDate === 'string' && filter.toDate.length === 10) {
            to.setHours(23, 59, 59, 999);
          }
          where.movementDate.lte = to;
        }
      }
    }

    if (filter.search && filter.search.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { concept: { contains: q, mode: 'insensitive' } },
        { externalReference: { contains: q, mode: 'insensitive' } },
        { referenceDocumentId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.bankMovement.findMany({
        where,
        orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.bankMovement.count({ where }),
    ]);

    return {
      items: items.map(mapMovementToDto),
      total,
    };
  }

  async revertMovement(
    accountId: string,
    movementId: string,
    reason: string,
    userId: string,
  ): Promise<BankMovementDto> {
    validateUuid(accountId, 'ID de cuenta bancaria');
    validateUuid(movementId, 'ID de movimiento');
    const trimmedReason = validateConcept(reason);

    return prisma.$transaction(
      async (tx) => {
        const movement = await tx.bankMovement.findUnique({
          where: { id: movementId },
        });

        if (!movement || movement.bankAccountId !== accountId) {
          throw new TreasuryNotFoundError('Movimiento bancario no encontrado en esta cuenta.');
        }

        if (movement.referenceDocumentType === 'REVERSAL') {
          throw new TreasuryValidationError('No se puede reversar un movimiento que ya es una reversión.');
        }

        // Verificar si ya fue reversado previamente
        const alreadyReversed = await tx.bankMovement.findFirst({
          where: {
            bankAccountId: accountId,
            referenceDocumentType: 'REVERSAL',
            referenceDocumentId: movementId,
          },
        });
        if (alreadyReversed) {
          throw new TreasuryConflictError('Este movimiento bancario ya fue reversado previamente.');
        }

        // Si era DEPOSIT / TRANSFER_IN, se revierte con WITHDRAWAL; si era WITHDRAWAL / TRANSFER_OUT, se revierte con DEPOSIT
        const isOriginalInflow =
          movement.movementType === 'DEPOSIT' || movement.movementType === 'TRANSFER_IN';
        const reversalType = isOriginalInflow ? 'WITHDRAWAL' : 'DEPOSIT';

        const rows = await tx.$queryRaw<Array<{ id: string; current_balance: Prisma.Decimal; is_active: boolean }>>`
          SELECT id, current_balance, is_active
          FROM bank_accounts
          WHERE id = ${accountId}::uuid
          FOR UPDATE
        `;

        const locked = rows[0];
        if (!locked) {
          throw new TreasuryNotFoundError('Cuenta bancaria no encontrada.');
        }
        if (!locked.is_active) {
          throw new TreasuryValidationError('No se pueden registrar reversiones en una cuenta bancaria inactiva.');
        }

        const currentBalanceCents = parseMoneyToCents(
          locked.current_balance.toString(),
          'Saldo actual',
        );

        const amountCents = parseMoneyToCents(movement.amount.toString(), 'Importe');

        const { balanceBefore, balanceAfter } = calculateNewBalanceCents(
          currentBalanceCents,
          reversalType,
          amountCents,
          false,
        );

        const balanceBeforeDec = new Prisma.Decimal(centsToMoneyString(balanceBefore));
        const balanceAfterDec = new Prisma.Decimal(centsToMoneyString(balanceAfter));
        const amountDec = new Prisma.Decimal(centsToMoneyString(amountCents));

        await tx.bankAccount.update({
          where: { id: accountId },
          data: {
            currentBalance: balanceAfterDec,
          },
        });

        const reversalMovement = await tx.bankMovement.create({
          data: {
            bankAccountId: accountId,
            movementType: reversalType,
            amount: amountDec,
            balanceBefore: balanceBeforeDec,
            balanceAfter: balanceAfterDec,
            concept: `Reversión de movimiento #${movement.id.slice(0, 8)}: ${trimmedReason}`,
            referenceDocumentType: 'REVERSAL',
            referenceDocumentId: movement.id,
            externalReference: movement.externalReference,
            movementDate: new Date(),
            createdById: userId,
          },
        });

        await tx.auditEvent.create({
          data: {
            action: 'treasury:bank_movement_reversed',
            entity: 'BankMovement',
            entityId: reversalMovement.id,
            userId,
            details: {
              bankAccountId: accountId,
              originalMovementId: movement.id,
              reversalMovementId: reversalMovement.id,
              amount: centsToMoneyString(amountCents),
              reason: trimmedReason,
              balanceBefore: centsToMoneyString(balanceBefore),
              balanceAfter: centsToMoneyString(balanceAfter),
            } as unknown as Prisma.InputJsonValue,
          },
        });

        return mapMovementToDto(reversalMovement);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }
}
