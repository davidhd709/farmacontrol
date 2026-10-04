import { Injectable } from '@nestjs/common';
import { AccountingPurpose as DbPurpose, prisma, Prisma } from '@farmacia/database';
import {
  AccountingConflictError,
  AccountingNotFoundError,
  AccountingValidationError,
} from '../domain/accounting-rules';
import {
  type JournalEntryDto,
  type JournalEntryLineDto,
  type JournalEntryQueryFilters,
  type AccountingPurpose,
} from '@farmacia/contracts';
import {
  parseJournalDate,
  normalizeJournalAmount,
  validateJournalPost,
  type JournalPostInput,
  type ValidatedJournalPost,
} from '../domain/journal-rules';

type Tx = Prisma.TransactionClient;
const journalInclude = { lines: { orderBy: { position: 'asc' as const } } } as const;
type PostedEntry = Prisma.JournalEntryGetPayload<{ include: typeof journalInclude }>;

const fullJournalInclude = {
  lines: {
    orderBy: { position: 'asc' as const },
    include: {
      account: {
        select: { id: true, code: true, name: true, type: true },
      },
    },
  },
  createdBy: {
    select: { id: true, username: true },
  },
} as const;

type FullJournalEntry = Prisma.JournalEntryGetPayload<{ include: typeof fullJournalInclude }>;

function toJournalEntryDto(entry: FullJournalEntry): JournalEntryDto {
  let totalDebitCents = 0n;
  let totalCreditCents = 0n;

  const lines: JournalEntryLineDto[] = entry.lines.map((l) => {
    const dVal = l.debit.toFixed(2);
    const cVal = l.credit.toFixed(2);
    totalDebitCents += normalizeJournalAmount(dVal).cents;
    totalCreditCents += normalizeJournalAmount(cVal).cents;

    return {
      id: l.id,
      position: l.position,
      accountId: l.accountId,
      accountCode: l.account?.code,
      accountName: l.account?.name,
      purpose: (l.purpose as AccountingPurpose) ?? null,
      description: l.description ?? null,
      debit: dVal,
      credit: cVal,
    };
  });

  return {
    id: entry.id,
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    description: entry.description,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    status: entry.status,
    createdById: entry.createdById,
    createdByName: entry.createdBy?.username || null,
    createdAt: entry.createdAt.toISOString(),
    postedAt: entry.postedAt?.toISOString() || null,
    reversalOfId: entry.reversalOfId,
    reversalReason: entry.reversalReason,
    lines,
    totalDebit: `${totalDebitCents / 100n}.${(totalDebitCents % 100n).toString().padStart(2, '0')}`,
    totalCredit: `${totalCreditCents / 100n}.${(totalCreditCents % 100n).toString().padStart(2, '0')}`,
  };
}

export interface JournalReverseInput {
  entryId: string;
  entryDate: string;
  reason: string;
  createdById?: string;
}

function dateText(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function samePost(existing: PostedEntry, requested: ValidatedJournalPost): boolean {
  return (
    existing.status === 'POSTED' &&
    existing.reversalOfId === null &&
    dateText(existing.entryDate) === requested.entryDate &&
    existing.description === requested.description &&
    existing.createdById === (requested.createdById ?? null) &&
    existing.lines.length === requested.lines.length &&
    existing.lines.every((line, index) => {
      const wanted = requested.lines[index];
      const matchPurposeOrAccount = wanted.purpose
        ? line.purpose === wanted.purpose
        : line.accountId === wanted.accountId;
      return (
        line.position === index + 1 &&
        matchPurposeOrAccount &&
        (line.description ?? undefined) === wanted.description &&
        line.debit.toFixed(2) === wanted.debit &&
        line.credit.toFixed(2) === wanted.credit
      );
    })
  );
}

function sameReverse(
  existing: PostedEntry,
  originalId: string,
  date: string,
  reason: string,
  userId?: string,
): boolean {
  return (
    existing.status === 'POSTED' &&
    existing.reversalOfId === originalId &&
    dateText(existing.entryDate) === date &&
    existing.reversalReason === reason &&
    existing.createdById === (userId ?? null)
  );
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

@Injectable()
export class JournalService {
  async findBySource(sourceType: string, sourceId: string, tx?: Tx) {
    return (tx ?? prisma).journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType, sourceId } },
      include: journalInclude,
    });
  }

  private async postOnce(input: ValidatedJournalPost, tx: Tx): Promise<PostedEntry> {
    const existing = await this.findBySource(input.sourceType, input.sourceId, tx);
    if (existing) {
      if (!samePost(existing, input))
        throw new AccountingConflictError('El origen ya tiene un asiento con contenido diferente.');
      return existing;
    }

    const date = parseJournalDate(input.entryDate);

    const closedPeriod = await tx.fiscalPeriod.findFirst({
      where: {
        status: 'CLOSED',
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });
    if (closedPeriod) {
      throw new AccountingValidationError(
        `No es posible registrar asientos en el período cerrado ${closedPeriod.name} (${closedPeriod.year}-${String(closedPeriod.month).padStart(2, '0')}).`,
      );
    }

    const accounts = new Map<DbPurpose, string>();
    const purposesToLookup = new Set<DbPurpose>();
    for (const line of input.lines) {
      if (line.purpose) purposesToLookup.add(line.purpose as DbPurpose);
    }

    for (const purpose of purposesToLookup) {
      const mappings = await tx.companyAccountingMapping.findMany({
        where: {
          purpose,
          status: 'ACTIVE',
          accountId: { not: null },
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
        },
        include: { account: true },
        take: 2,
      });
      if (
        mappings.length !== 1 ||
        !mappings[0].account?.isActive ||
        !mappings[0].account.allowsMovement
      )
        throw new AccountingValidationError(`Falta un mapeo activo e imputable para ${purpose}.`);
      accounts.set(purpose, mappings[0].account.id);
    }

    for (const line of input.lines) {
      if (line.accountId) {
        const acc = await tx.account.findUnique({ where: { id: line.accountId } });
        if (!acc || !acc.isActive || !acc.allowsMovement) {
          throw new AccountingValidationError(
            `La cuenta contable ${line.accountId} no es válida, no está activa o no es imputable.`,
          );
        }
      }
    }

    const entry = await tx.journalEntry.create({
      data: {
        entryDate: date,
        description: input.description,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        createdById: input.createdById ?? null,
      },
    });
    await tx.journalEntryLine.createMany({
      data: input.lines.map((line, index) => ({
        journalEntryId: entry.id,
        position: index + 1,
        accountId: line.accountId || accounts.get(line.purpose as DbPurpose)!,
        purpose: (line.purpose as DbPurpose) || null,
        description: line.description ?? null,
        debit: new Prisma.Decimal(line.debit),
        credit: new Prisma.Decimal(line.credit),
      })),
    });
    return tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: 'POSTED', postedAt: new Date() },
      include: journalInclude,
    });
  }

  async post(raw: JournalPostInput, tx?: Tx): Promise<PostedEntry> {
    const input = validateJournalPost(raw);
    if (tx) {
      const isolation = await tx.$queryRaw<{ level: string }[]>`
        SELECT current_setting('transaction_isolation') AS level
      `;
      if (isolation[0]?.level !== 'serializable')
        throw new AccountingValidationError('El asiento requiere una transacción SERIALIZABLE.');
      return this.postOnce(input, tx);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await prisma.$transaction((client) => this.postOnce(input, client), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (isCode(error, 'P2002') || isCode(error, 'P2034')) {
          const existing = await this.findBySource(input.sourceType, input.sourceId);
          if (existing) {
            if (!samePost(existing, input))
              throw new AccountingConflictError(
                'El origen ya tiene un asiento con contenido diferente.',
              );
            return existing;
          }
        }
        if (isCode(error, 'P2034') && attempt < 2) continue;
        throw error;
      }
    }
    throw new AccountingConflictError('No se pudo confirmar el asiento.');
  }

  private async reverseOnce(
    input: JournalReverseInput,
    date: Date,
    reason: string,
    tx: Tx,
  ): Promise<PostedEntry> {
    const original = await tx.journalEntry.findUnique({
      where: { id: input.entryId },
      include: journalInclude,
    });
    if (!original || original.status !== 'POSTED')
      throw new AccountingNotFoundError('Asiento publicado inexistente.');
    const existing = await tx.journalEntry.findUnique({
      where: { reversalOfId: original.id },
      include: journalInclude,
    });
    if (existing) {
      if (!sameReverse(existing, original.id, input.entryDate, reason, input.createdById))
        throw new AccountingConflictError('El asiento ya fue reversado con datos diferentes.');
      return existing;
    }

    const closedPeriod = await tx.fiscalPeriod.findFirst({
      where: {
        status: 'CLOSED',
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });
    if (closedPeriod) {
      throw new AccountingValidationError(
        `No es posible reversar asientos en el período cerrado ${closedPeriod.name} (${closedPeriod.year}-${String(closedPeriod.month).padStart(2, '0')}).`,
      );
    }

    const entry = await tx.journalEntry.create({
      data: {
        entryDate: date,
        description: `Reversión de asiento ${original.id}`,
        sourceType: 'REVERSAL',
        sourceId: original.id,
        createdById: input.createdById ?? null,
        reversalOfId: original.id,
        reversalReason: reason,
      },
    });
    await tx.journalEntryLine.createMany({
      data: original.lines.map((line) => ({
        journalEntryId: entry.id,
        position: line.position,
        accountId: line.accountId,
        purpose: line.purpose,
        description: line.description,
        debit: line.credit,
        credit: line.debit,
      })),
    });
    return tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: 'POSTED', postedAt: new Date() },
      include: journalInclude,
    });
  }

  async reverse(input: JournalReverseInput, tx?: Tx): Promise<PostedEntry> {
    if (!input || typeof input.entryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.entryId))
      throw new AccountingValidationError('Asiento a reversar inválido.');
    const date = parseJournalDate(input.entryDate);
    if (
      typeof input.reason !== 'string' ||
      !input.reason.trim() ||
      input.reason.trim().length > 500
    )
      throw new AccountingValidationError('Motivo de reversión inválido.');
    const reason = input.reason.trim();
    if (tx) return this.reverseOnce(input, date, reason, tx);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await prisma.$transaction(
          (client) => this.reverseOnce(input, date, reason, client),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (isCode(error, 'P2002') || isCode(error, 'P2034')) {
          const existing = await prisma.journalEntry.findUnique({
            where: { reversalOfId: input.entryId },
            include: journalInclude,
          });
          if (existing) {
            if (!sameReverse(existing, input.entryId, input.entryDate, reason, input.createdById))
              throw new AccountingConflictError(
                'El asiento ya fue reversado con datos diferentes.',
              );
            return existing;
          }
        }
        if (isCode(error, 'P2034') && attempt < 2) continue;
        throw error;
      }
    }
    throw new AccountingConflictError('No se pudo reversar el asiento.');
  }

  async canPostForPurposes(purposes: DbPurpose[], date = new Date(), tx?: Tx): Promise<boolean> {
    const client = tx ?? prisma;
    for (const purpose of new Set(purposes)) {
      const mapping = await client.companyAccountingMapping.findFirst({
        where: {
          purpose,
          status: 'ACTIVE',
          accountId: { not: null },
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
          account: {
            isActive: true,
            allowsMovement: true,
          },
        },
      });
      if (!mapping) return false;
    }
    return true;
  }

  async findAll(filters: JournalEntryQueryFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.JournalEntryWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.sourceType) {
      where.sourceType = filters.sourceType;
    }

    if (filters.fromDate || filters.toDate) {
      where.entryDate = {};
      if (filters.fromDate) {
        where.entryDate.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setHours(23, 59, 59, 999);
        where.entryDate.lte = to;
      }
    }

    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { sourceId: { contains: q, mode: 'insensitive' } },
        { sourceType: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: fullJournalInclude,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return {
      items: items.map(toJournalEntryDto),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findById(id: string): Promise<JournalEntryDto> {
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: fullJournalInclude,
    });
    if (!entry) throw new AccountingNotFoundError('Comprobante contable no encontrado.');
    return toJournalEntryDto(entry);
  }
}
