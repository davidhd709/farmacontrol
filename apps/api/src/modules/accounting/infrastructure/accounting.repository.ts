import { Injectable } from '@nestjs/common';
import {
  prisma,
  Prisma,
  AccountType as DbAccountType,
  AccountingPurpose as DbPurpose,
} from '@farmacia/database';
import {
  AccountDto,
  AccountingPurposeDto,
  ACCOUNTING_PURPOSES,
  AccountingConfigurationStatusDto,
  AccountInput,
} from '@farmacia/contracts';
import {
  AccountingConflictError,
  AccountingNotFoundError,
  AccountingValidationError,
  validateParent,
  validatePurposeAccountType,
} from '../domain/accounting-rules';

type Tx = Prisma.TransactionClient;
type AccountRecord = NonNullable<Awaited<ReturnType<typeof prisma.account.findFirst>>>;

function dateOnly(value: Date): Date {
  if (Number.isNaN(value.getTime()))
    throw new AccountingValidationError('Fecha de vigencia inválida.');
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dto(account: AccountRecord): AccountDto {
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    parentId: account.parentId,
    level: account.level,
    allowsMovement: account.allowsMovement,
    isActive: account.isActive,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

@Injectable()
export class AccountingRepository {
  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 60000,
      maxWait: 15000,
    });
  }

  async listAccounts(): Promise<AccountDto[]> {
    return (await prisma.account.findMany({ orderBy: { code: 'asc' } })).map(dto);
  }

  async createAccount(input: AccountInput, userId: string, tx: Tx): Promise<AccountDto> {
    if (await tx.account.findUnique({ where: { code: input.code } }))
      throw new AccountingConflictError(`El código ${input.code} ya existe.`);
    const parent = input.parentId
      ? await tx.account.findUnique({ where: { id: input.parentId } })
      : null;
    validateParent(input, parent, input.parentId ?? null);
    const account = await tx.account.create({
      data: {
        code: input.code,
        name: input.name,
        type: input.type as DbAccountType,
        parentId: input.parentId ?? null,
        level: parent ? parent.level + 1 : 1,
        allowsMovement: input.allowsMovement,
        isActive: input.isActive ?? true,
      },
    });
    await this.audit(tx, 'accounting:account_created', 'Account', account.id, userId, {
      code: account.code,
    });
    return dto(account);
  }

  async updateAccount(
    id: string,
    input: Partial<AccountInput>,
    userId: string,
    tx: Tx,
  ): Promise<AccountDto> {
    const current = await tx.account.findUnique({ where: { id } });
    if (!current) throw new AccountingNotFoundError('Cuenta inexistente.');
    const next = { ...current, ...input };
    if (next.code !== current.code && (await tx.account.findUnique({ where: { code: next.code } })))
      throw new AccountingConflictError(`El código ${next.code} ya existe.`);
    const parent = next.parentId
      ? await tx.account.findUnique({ where: { id: next.parentId } })
      : null;
    validateParent({ id, code: next.code, type: next.type }, parent, next.parentId);
    let cursor = parent;
    while (cursor) {
      if (cursor.id === id)
        throw new AccountingValidationError('La jerarquía no puede contener ciclos.');
      cursor = cursor.parentId
        ? await tx.account.findUnique({ where: { id: cursor.parentId } })
        : null;
    }
    if (
      next.type !== current.type &&
      (await tx.companyAccountingMapping.count({ where: { accountId: id } }))
    )
      throw new AccountingValidationError(
        'No se puede cambiar el tipo de una cuenta con historial de propósitos.',
      );
    if (
      (next.code !== current.code ||
        next.type !== current.type ||
        next.parentId !== current.parentId) &&
      (await tx.journalEntryLine.count({ where: { accountId: id } }))
    )
      throw new AccountingValidationError(
        'No se puede reclasificar una cuenta con asientos publicados.',
      );
    const children = await tx.account.count({ where: { parentId: id } });
    if (
      children &&
      (next.code !== current.code ||
        next.type !== current.type ||
        next.parentId !== current.parentId ||
        next.allowsMovement ||
        !next.isActive)
    )
      throw new AccountingValidationError(
        'La cuenta con subcuentas no puede cambiar código, tipo, padre, permitir movimiento ni inactivarse.',
      );
    if (!next.isActive || !next.allowsMovement) {
      const activeMapping = await tx.companyAccountingMapping.count({
        where: {
          accountId: id,
          status: 'ACTIVE',
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
      });
      if (activeMapping)
        throw new AccountingValidationError('La cuenta tiene propósitos activos asignados.');
    }
    const updated = await tx.account.update({
      where: { id },
      data: {
        code: next.code,
        name: next.name,
        type: next.type,
        parentId: next.parentId,
        level: parent ? parent.level + 1 : 1,
        allowsMovement: next.allowsMovement,
        isActive: next.isActive,
      },
    });
    await this.audit(tx, 'accounting:account_updated', 'Account', id, userId, {
      before: dto(current),
      after: dto(updated),
    } as unknown as Prisma.InputJsonValue);
    return dto(updated);
  }

  async listMappings(date = new Date()): Promise<AccountingPurposeDto[]> {
    const effectiveDate = dateOnly(date);
    const rows = await prisma.companyAccountingMapping.findMany({
      where: {
        effectiveFrom: { lte: effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
      },
      include: { account: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    return ACCOUNTING_PURPOSES.map((purpose) => {
      const row = rows.find((item) => item.purpose === purpose);
      return {
        purpose,
        accountId: row?.accountId ?? null,
        account: row?.account ? dto(row.account) : null,
        status: row?.status ?? 'PENDING_MAPPING',
      };
    });
  }

  async setMapping(
    purpose: DbPurpose,
    accountId: string | null,
    userId: string,
    tx: Tx,
    effectiveDate = new Date(),
  ): Promise<AccountingPurposeDto> {
    const account = accountId ? await tx.account.findUnique({ where: { id: accountId } }) : null;
    if (accountId && !account) throw new AccountingNotFoundError('Cuenta inexistente.');
    if (account && (!account.isActive || !account.allowsMovement))
      throw new AccountingValidationError(
        'El propósito requiere una cuenta activa que permita movimiento.',
      );
    if (account) validatePurposeAccountType(purpose, account.type);
    const today = dateOnly(effectiveDate);
    const current = await tx.companyAccountingMapping.findFirst({
      where: {
        purpose,
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (current?.effectiveFrom.getTime() === today.getTime()) {
      await tx.companyAccountingMapping.update({
        where: { id: current.id },
        data: { accountId, status: accountId ? 'ACTIVE' : 'PENDING_MAPPING', updatedById: userId },
      });
    } else {
      if (current) {
        const yesterday = new Date(today);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        await tx.companyAccountingMapping.update({
          where: { id: current.id },
          data: { effectiveTo: yesterday },
        });
      }
      await tx.companyAccountingMapping.create({
        data: {
          purpose,
          accountId,
          status: accountId ? 'ACTIVE' : 'PENDING_MAPPING',
          effectiveFrom: today,
          updatedById: userId,
        },
      });
    }
    await this.audit(tx, 'accounting:purpose_mapped', 'CompanyAccountingMapping', purpose, userId, {
      beforeAccountId: current?.accountId ?? null,
      accountId,
    });
    return {
      purpose,
      accountId,
      account: account ? dto(account) : null,
      status: accountId ? 'ACTIVE' : 'PENDING_MAPPING',
    };
  }

  async resolveAccountByPurpose(purpose: DbPurpose, date = new Date()): Promise<AccountDto> {
    const match = (await this.listMappings(date)).find((row) => row.purpose === purpose);
    if (
      !match ||
      match.status !== 'ACTIVE' ||
      !match.account?.isActive ||
      !match.account.allowsMovement
    )
      throw new AccountingValidationError(
        `El propósito ${purpose} no tiene una cuenta imputable activa.`,
      );
    return match.account;
  }

  async configurationStatus(): Promise<AccountingConfigurationStatusDto> {
    const mappings = await this.listMappings();
    const missing = mappings
      .filter(
        (row) => row.status !== 'ACTIVE' || !row.account?.isActive || !row.account.allowsMovement,
      )
      .map((row) => row.purpose);
    return {
      total: ACCOUNTING_PURPOSES.length,
      configured: ACCOUNTING_PURPOSES.length - missing.length,
      missing,
      status: missing.length ? 'INCOMPLETE' : 'READY',
    };
  }

  async audit(
    tx: Tx,
    action: string,
    entity: string,
    entityId: string,
    userId: string,
    details: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.auditEvent.create({ data: { action, entity, entityId, userId, details } });
  }
}
