import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, cleanTestDatabase, prisma } from '@farmacia/database';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import {
  AccountingConflictError,
  AccountingValidationError,
} from '../../src/modules/accounting/domain/accounting-rules';
import type { JournalPostInput } from '../../src/modules/accounting/domain/journal-rules';

const journal = new JournalService();
const entryDate = '2026-09-30';

async function mappedAccounts() {
  const cash = await prisma.account.create({
    data: { code: '110505', name: 'Caja', type: 'ASSET', level: 1, allowsMovement: true },
  });
  const income = await prisma.account.create({
    data: { code: '413538', name: 'Ventas', type: 'INCOME', level: 1, allowsMovement: true },
  });
  await prisma.companyAccountingMapping.createMany({
    data: [
      {
        purpose: 'CASH',
        accountId: cash.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        purpose: 'SALES_TAXED',
        accountId: income.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  });
  return { cash, income };
}

function input(sourceId = 'sale-1'): JournalPostInput {
  return {
    entryDate,
    description: 'Venta de prueba',
    sourceType: 'TEST_SALE',
    sourceId,
    lines: [
      { purpose: 'CASH', debit: '100.00', credit: '0' },
      { purpose: 'SALES_TAXED', debit: '0', credit: '100.00' },
    ],
  };
}

describe('Journal 11.2 PostgreSQL', () => {
  beforeEach(async () => {
    await cleanTestDatabase();
    await mappedAccounts();
  });
  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  });

  it('publica un asiento balanceado y conserva el origen y propósito por línea', async () => {
    const posted = await journal.post(input());
    expect(posted.status).toBe('POSTED');
    expect(posted.lines).toHaveLength(2);
    expect(posted.lines.map((line) => line.purpose)).toEqual(['CASH', 'SALES_TAXED']);
    expect(posted.lines.map((line) => line.debit.toFixed(2))).toEqual(['100.00', '0.00']);
    expect((await journal.findBySource('TEST_SALE', 'sale-1'))?.id).toBe(posted.id);
    expect(await prisma.journalEntry.count()).toBe(1);
  });

  it('rechaza importes inválidos o descuadrados sin escribir', async () => {
    await expect(
      journal.post({
        ...input(),
        lines: [
          { purpose: 'CASH', debit: '100.001', credit: '0' },
          { purpose: 'SALES_TAXED', debit: '0', credit: '100.00' },
        ],
      }),
    ).rejects.toBeInstanceOf(AccountingValidationError);
    await expect(
      journal.post({
        ...input(),
        lines: [
          { purpose: 'CASH', debit: '99.99', credit: '0' },
          { purpose: 'SALES_TAXED', debit: '0', credit: '100.00' },
        ],
      }),
    ).rejects.toBeInstanceOf(AccountingValidationError);
    expect(await prisma.journalEntry.count()).toBe(0);
  });

  it('rechaza propósito sin mapeo vigente y revierte toda escritura', async () => {
    await prisma.companyAccountingMapping.updateMany({
      where: { purpose: 'CASH' },
      data: { status: 'INACTIVE' },
    });
    await expect(journal.post(input())).rejects.toBeInstanceOf(AccountingValidationError);
    expect(await prisma.journalEntry.count()).toBe(0);
  });

  it('mantiene idempotencia y detecta reintento alterado', async () => {
    const first = await journal.post(input());
    const retry = await journal.post(input());
    expect(retry.id).toBe(first.id);
    await expect(
      journal.post({ ...input(), description: 'Otro origen lógico' }),
    ).rejects.toBeInstanceOf(AccountingConflictError);
    expect(await prisma.journalEntry.count()).toBe(1);
  });

  it('revierte con líneas espejo aun si una cuenta histórica quedó inactiva', async () => {
    const original = await journal.post(input());
    await prisma.companyAccountingMapping.updateMany({ data: { status: 'INACTIVE' } });
    await prisma.account.updateMany({ where: { code: '110505' }, data: { isActive: false } });
    const reversal = await journal.reverse({
      entryId: original.id,
      entryDate,
      reason: 'Corrección',
    });
    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.lines[0].credit.toFixed(2)).toBe('100.00');
    expect(reversal.lines[0].purpose).toBe('CASH');
    expect(
      (await journal.reverse({ entryId: original.id, entryDate, reason: 'Corrección' })).id,
    ).toBe(reversal.id);
    await expect(
      journal.reverse({ entryId: original.id, entryDate, reason: 'Otro motivo' }),
    ).rejects.toBeInstanceOf(AccountingConflictError);
    expect(await prisma.journalEntry.count()).toBe(2);
  });

  it('prohíbe modificar asientos publicados y líneas directamente en PostgreSQL', async () => {
    const posted = await journal.post(input());
    await expect(
      prisma.journalEntry.update({ where: { id: posted.id }, data: { description: 'Alterado' } }),
    ).rejects.toThrow();
    await expect(
      prisma.journalEntryLine.update({
        where: { id: posted.lines[0].id },
        data: { debit: new Prisma.Decimal('200.00') },
      }),
    ).rejects.toThrow();
    await expect(prisma.journalEntry.delete({ where: { id: posted.id } })).rejects.toThrow();
  });

  it('no permite confirmar un DRAFT descuadrado ni conservar DRAFT al commit', async () => {
    await expect(
      prisma.journalEntry.create({
        data: {
          entryDate: new Date('2026-09-30T00:00:00.000Z'),
          description: 'Incompleto',
          sourceType: 'TEST',
          sourceId: 'draft',
        },
      }),
    ).rejects.toThrow();
    const accounts = await prisma.account.findMany();
    await expect(
      prisma.$transaction(async (tx) => {
        const entry = await tx.journalEntry.create({
          data: {
            entryDate: new Date('2026-09-30T00:00:00.000Z'),
            description: 'Descuadrado',
            sourceType: 'TEST',
            sourceId: 'bad',
          },
        });
        await tx.journalEntryLine.createMany({
          data: [
            {
              journalEntryId: entry.id,
              position: 1,
              accountId: accounts[0].id,
              debit: '100.00',
              credit: '0.00',
            },
            {
              journalEntryId: entry.id,
              position: 2,
              accountId: accounts[1].id,
              debit: '0.00',
              credit: '99.99',
            },
          ],
        });
        await tx.journalEntry.update({
          where: { id: entry.id },
          data: { status: 'POSTED', postedAt: new Date() },
        });
      }),
    ).rejects.toThrow();
    expect(await prisma.journalEntry.count()).toBe(0);
  });

  it('participa en una transacción externa y revierte por completo al fallar', async () => {
    await expect(
      prisma.$transaction(
        async (tx) => {
          await journal.post(input(), tx);
          throw new Error('rollback esperado');
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    ).rejects.toThrow('rollback esperado');
    expect(await prisma.journalEntry.count()).toBe(0);
  });

  it('rechaza transacciones externas sin aislamiento serializable', async () => {
    await expect(prisma.$transaction((tx) => journal.post(input(), tx))).rejects.toBeInstanceOf(
      AccountingValidationError,
    );
    expect(await prisma.journalEntry.count()).toBe(0);
  });

  it('congela código y jerarquía de una cuenta usada en el diario, incluso vía SQL', async () => {
    const posted = await journal.post(input());
    const accountId = posted.lines[0].accountId;
    await expect(
      prisma.account.update({ where: { id: accountId }, data: { code: '110506' } }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE accounts SET level = 2 WHERE id = ${accountId}::uuid`,
    ).rejects.toThrow();
    expect((await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).code).toBe(
      '110505',
    );
  });

  it('serializa dos reversiones simultáneas del mismo asiento', async () => {
    const original = await journal.post(input());
    const request = { entryId: original.id, entryDate, reason: 'Corrección' };
    const [a, b] = await Promise.all([journal.reverse(request), journal.reverse(request)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.journalEntry.count()).toBe(2);
  });
  it('serializa dos confirmaciones concurrentes del mismo origen', async () => {
    const [a, b] = await Promise.all([journal.post(input()), journal.post(input())]);
    expect(a.id).toBe(b.id);
    expect(await prisma.journalEntry.count()).toBe(1);
  });
});
