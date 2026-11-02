import {
  businessDayStart,
  businessDayEnd,
} from '../../../common/utils/business-date';
import { Injectable, Optional } from '@nestjs/common';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';
import { Prisma, prisma, type BankAccount, type BankMovement } from '@farmacia/database';
import type {
  BankAccountDto,
  BankAccountOptionDto,
  BankAccountsSummaryDto,
  BankMovementDto,
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from '@farmacia/contracts';
import {
  centsToMoneyString,
  parseMoneyToCents,
  TreasuryConflictError,
  TreasuryNotFoundError,
  TreasuryValidationError,
  validateAccountName,
  validateAccountNumber,
  validateAccountType,
  validateBankName,
  validateUuid,
} from '../domain/treasury-rules';

export interface MovementFilter {
  fromDate?: string;
  toDate?: string;
  movementType?: string;
  direction?: string;
  sortOrder?: string;
  search?: string;
  page?: number;
  limit?: number;
}

const OUTFLOW_TYPES = ['WITHDRAWAL', 'TRANSFER_OUT', 'FEE'];

const LEDGER_INCLUDE = { ledgerAccount: { select: { code: true, name: true } } } as const;
type BankAccountWithLedger = BankAccount & {
  ledgerAccount?: { code: string; name: string } | null;
};

/**
 * La subcuenta del PUC de una cuenta bancaria debe ser del disponible (grupo 11, sin la caja
 * 1105), activa e imputable, y no estar asignada a otra cuenta bancaria.
 */
async function validateLedgerAccount(
  client: Prisma.TransactionClient | typeof prisma,
  ledgerAccountId: unknown,
  bankAccountId?: string,
): Promise<string> {
  const id = validateUuid(ledgerAccountId, 'Subcuenta del PUC');
  const account = await client.account.findUnique({ where: { id } });
  if (!account) throw new TreasuryValidationError('La subcuenta del PUC no existe.');
  if (
    account.type !== 'ASSET' ||
    !account.code.startsWith('11') ||
    account.code.startsWith('1105')
  ) {
    throw new TreasuryValidationError(
      'La cuenta bancaria debe vincularse a una subcuenta de bancos del PUC (grupo 11, distinta de caja 1105).',
    );
  }
  if (!account.isActive || !account.allowsMovement) {
    throw new TreasuryValidationError(
      'La subcuenta del PUC debe estar activa y permitir movimientos.',
    );
  }
  const taken = await client.bankAccount.findFirst({
    where: { ledgerAccountId: id, ...(bankAccountId ? { id: { not: bankAccountId } } : {}) },
  });
  if (taken) {
    throw new TreasuryConflictError(
      `La subcuenta ${account.code} ya está asignada a la cuenta bancaria '${taken.name}'.`,
    );
  }
  return id;
}

function mapAccountToDto(account: BankAccountWithLedger): BankAccountDto {
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
    ledgerAccountId: account.ledgerAccountId,
    ledgerAccountCode: account.ledgerAccount?.code ?? null,
    ledgerAccountName: account.ledgerAccount?.name ?? null,
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
  /** Opcional: algunas pruebas construyen el servicio sin el motor contable */
  constructor(@Optional() private readonly accountingEngine?: AccountingEngineService) {}

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

    const ledgerAccountId = await validateLedgerAccount(prisma, dto.ledgerAccountId);

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
          ledgerAccountId,
          createdById: userId,
        },
        include: LEDGER_INCLUDE,
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
            ledgerAccountId,
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
      include: LEDGER_INCLUDE,
    });
    return accounts.map(mapAccountToDto);
  }

  async getAccount(id: string): Promise<BankAccountDto> {
    validateUuid(id, 'ID de cuenta bancaria');
    const account = await prisma.bankAccount.findUnique({
      where: { id },
      include: LEDGER_INCLUDE,
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
    if (dto.ledgerAccountId !== undefined) {
      // Afecta solo los asientos posteriores; los ya registrados conservan su cuenta
      data.ledgerAccount = {
        connect: { id: await validateLedgerAccount(prisma, dto.ledgerAccountId, id) },
      };
    }

    if (Object.keys(data).length === 0) {
      throw new TreasuryValidationError('No se especificaron campos válidos para actualizar.');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.bankAccount.update({
        where: { id },
        data,
        include: LEDGER_INCLUDE,
      });

      await tx.auditEvent.create({
        data: {
          action: 'treasury:bank_account_updated',
          entity: 'BankAccount',
          entityId: id,
          userId,
          details: {
            before: {
              name: current.name,
              isActive: current.isActive,
              notes: current.notes,
              ledgerAccountId: current.ledgerAccountId,
            },
            after: {
              name: updated.name,
              isActive: updated.isActive,
              notes: updated.notes,
              ledgerAccountId: updated.ledgerAccountId,
            },
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return mapAccountToDto(updated);
    });
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
    if (filter.direction !== undefined) {
      if (filter.direction !== 'DEBITO' && filter.direction !== 'CREDITO') {
        throw new TreasuryValidationError('El sentido del movimiento debe ser DEBITO o CREDITO.');
      }
      // Débito aumenta el saldo de la cuenta bancaria; crédito lo disminuye (isOutflow)
      where.AND = [
        {
          movementType:
            filter.direction === 'CREDITO' ? { in: OUTFLOW_TYPES } : { notIn: OUTFLOW_TYPES },
        },
      ];
    }
    if (filter.sortOrder !== undefined && filter.sortOrder !== 'asc' && filter.sortOrder !== 'desc') {
      throw new TreasuryValidationError('El orden debe ser asc o desc.');
    }
    const order = filter.sortOrder === 'asc' ? 'asc' : 'desc';

    if (filter.fromDate || filter.toDate) {
      where.movementDate = {};
      if (filter.fromDate) {
        const from = new Date(filter.fromDate);
        if (!Number.isNaN(from.getTime())) {
          where.movementDate.gte =
            typeof filter.fromDate === 'string' && filter.fromDate.length === 10
              ? businessDayStart(filter.fromDate)
              : from;
        }
      }
      if (filter.toDate) {
        const to = new Date(filter.toDate);
        if (!Number.isNaN(to.getTime())) {
          if (typeof filter.toDate === 'string' && filter.toDate.length === 10) {
            where.movementDate.lte = businessDayEnd(filter.toDate);
          }
          if (!(typeof filter.toDate === 'string' && filter.toDate.length === 10))
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
        orderBy: [{ movementDate: order }, { createdAt: order }, { id: order }],
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

}
