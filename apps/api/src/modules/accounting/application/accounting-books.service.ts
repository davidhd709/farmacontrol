import { Injectable } from '@nestjs/common';
import { Prisma, prisma } from '@farmacia/database';
import type {
  AccountNature,
  JournalBookDto,
  LedgerBookDto,
  ReconciliationDto,
  ReconciliationItemDto,
} from '@farmacia/contracts';
import { AccountingRepository } from '../infrastructure/accounting.repository';
import { AccountingValidationError } from '../domain/accounting-rules';

const ZERO = new Prisma.Decimal(0);
const money = (value: Prisma.Decimal) => value.toFixed(2);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function assertRange(from: unknown, to: unknown): { from: string; to: string } {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof from !== 'string' || typeof to !== 'string' || !re.test(from) || !re.test(to)) {
    throw new AccountingValidationError('Indique el período con from y to en formato YYYY-MM-DD.');
  }
  if (from > to)
    throw new AccountingValidationError('La fecha inicial no puede ser posterior a la final.');
  return { from, to };
}

/**
 * Libros oficiales y conciliación (ADR-006, F8). Solo consideran asientos publicados; una
 * reversión es otro asiento publicado, así que los saldos ya la incluyen.
 */
@Injectable()
export class AccountingBooksService {
  constructor(private readonly repository: AccountingRepository) {}

  async journalBook(rawFrom: unknown, rawTo: unknown): Promise<JournalBookDto> {
    const { from, to } = assertRange(rawFrom, rawTo);
    const entries = await prisma.journalEntry.findMany({
      where: { status: 'POSTED', entryDate: { gte: day(from), lte: day(to) } },
      orderBy: [{ entryDate: 'asc' }, { postedAt: 'asc' }, { id: 'asc' }],
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    });
    let totalDebit = ZERO;
    let totalCredit = ZERO;
    return {
      from,
      to,
      entries: entries.map((entry) => ({
        id: entry.id,
        entryDate: entry.entryDate.toISOString().slice(0, 10),
        description: entry.description,
        sourceType: entry.sourceType,
        lines: entry.lines.map((line) => {
          totalDebit = totalDebit.plus(line.debit);
          totalCredit = totalCredit.plus(line.credit);
          return {
            accountCode: line.account.code,
            accountName: line.account.name,
            debit: money(line.debit),
            credit: money(line.credit),
          };
        }),
      })),
      totalDebit: money(totalDebit),
      totalCredit: money(totalCredit),
    };
  }

  /** Libro mayor y balances: saldo inicial, movimientos y saldo final por cuenta imputable. */
  async ledgerBook(rawFrom: unknown, rawTo: unknown): Promise<LedgerBookDto> {
    const { from, to } = assertRange(rawFrom, rawTo);
    const rows = await prisma.$queryRaw<
      Array<{
        account_id: string;
        code: string;
        name: string;
        nature: AccountNature;
        opening: Prisma.Decimal;
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
      }>
    >`
      SELECT a.id AS account_id, a.code, a.name, a.nature::text AS nature,
        COALESCE(SUM(CASE WHEN e.entry_date < ${day(from)}::date THEN l.debit - l.credit END), 0) AS opening,
        COALESCE(SUM(CASE WHEN e.entry_date >= ${day(from)}::date THEN l.debit END), 0) AS debit,
        COALESCE(SUM(CASE WHEN e.entry_date >= ${day(from)}::date THEN l.credit END), 0) AS credit
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'POSTED'
      JOIN accounts a ON a.id = l.account_id
      WHERE e.entry_date <= ${day(to)}::date
      GROUP BY a.id, a.code, a.name, a.nature
      ORDER BY a.code
    `;
    let totalDebit = ZERO;
    let totalCredit = ZERO;
    return {
      from,
      to,
      accounts: rows.map((row) => {
        const sign = row.nature === 'CREDIT' ? -1 : 1;
        const opening = new Prisma.Decimal(row.opening).mul(sign);
        const debit = new Prisma.Decimal(row.debit);
        const credit = new Prisma.Decimal(row.credit);
        totalDebit = totalDebit.plus(debit);
        totalCredit = totalCredit.plus(credit);
        return {
          accountId: row.account_id,
          code: row.code,
          name: row.name,
          nature: row.nature,
          openingBalance: money(opening),
          debit: money(debit),
          credit: money(credit),
          closingBalance: money(opening.plus(debit.minus(credit).mul(sign))),
        };
      }),
      totalDebit: money(totalDebit),
      totalCredit: money(totalCredit),
    };
  }

  /** Saldos contables frente a los auxiliares operativos (caja, bancos, cartera, CxP, inventario). */
  async reconciliation(): Promise<ReconciliationDto> {
    const mappings = await this.repository.listMappings();
    const accountOf = (purpose: string) =>
      mappings.find((m) => m.purpose === purpose && m.status === 'ACTIVE')?.accountId ?? null;
    const ledger = async (accountIds: string[]) => {
      if (accountIds.length === 0) return ZERO;
      const sum = await prisma.journalEntryLine.aggregate({
        where: { accountId: { in: accountIds }, journalEntry: { status: 'POSTED' } },
        _sum: { debit: true, credit: true },
      });
      return (sum._sum.debit ?? ZERO).minus(sum._sum.credit ?? ZERO);
    };
    const item = (
      key: ReconciliationItemDto['key'],
      label: string,
      ledgerBalance: Prisma.Decimal,
      subledgerBalance: Prisma.Decimal,
      mapped: boolean,
    ): ReconciliationItemDto => {
      const difference = ledgerBalance.minus(subledgerBalance);
      return {
        key,
        label,
        ledgerBalance: money(ledgerBalance),
        subledgerBalance: money(subledgerBalance),
        difference: money(difference),
        ok: mapped && difference.eq(0),
        detail: mapped
          ? difference.eq(0)
            ? 'Conciliado.'
            : 'Hay diferencia: revise operaciones sin asiento, saldos de apertura o asientos manuales.'
          : 'El propósito contable no está mapeado.',
      };
    };

    const items: ReconciliationItemDto[] = [];
    const cashAccount = accountOf('CASH');
    const lastCash = await prisma.cashMovement.findFirst({ orderBy: { createdAt: 'desc' } });
    items.push(
      item(
        'CASH',
        'Caja',
        await ledger(cashAccount ? [cashAccount] : []),
        lastCash?.balanceAfter ?? ZERO,
        Boolean(cashAccount),
      ),
    );

    // Bancos: las cuentas con subcuenta propia más la cuenta general del propósito BANK
    const bankAccount = accountOf('BANK');
    const banks = await prisma.bankAccount.findMany({
      select: { currentBalance: true, ledgerAccountId: true },
    });
    const bankLedgers = [
      ...new Set([
        ...(bankAccount ? [bankAccount] : []),
        ...banks.flatMap((b) => (b.ledgerAccountId ? [b.ledgerAccountId] : [])),
      ]),
    ];
    items.push(
      item(
        'BANK',
        'Bancos',
        await ledger(bankLedgers),
        banks.reduce((sum, b) => sum.plus(b.currentBalance), ZERO),
        bankLedgers.length > 0,
      ),
    );

    const customers = accountOf('CUSTOMERS');
    const receivables = await prisma.receivable.aggregate({ _sum: { balance: true } });
    items.push(
      item(
        'CUSTOMERS',
        'Clientes (cartera)',
        await ledger(customers ? [customers] : []),
        receivables._sum.balance ?? ZERO,
        Boolean(customers),
      ),
    );

    // Proveedores tiene naturaleza crédito: se compara con el signo invertido
    const suppliers = accountOf('SUPPLIERS');
    const payables = await prisma.payable.aggregate({ _sum: { balance: true } });
    items.push(
      item(
        'SUPPLIERS',
        'Proveedores (cuentas por pagar)',
        (await ledger(suppliers ? [suppliers] : [])).neg(),
        payables._sum.balance ?? ZERO,
        Boolean(suppliers),
      ),
    );

    const inventory = accountOf('INVENTORY');
    const valuation = await prisma.inventoryCostBalance.aggregate({ _sum: { totalValue: true } });
    items.push(
      item(
        'INVENTORY',
        'Inventarios',
        await ledger(inventory ? [inventory] : []),
        valuation._sum.totalValue ?? ZERO,
        Boolean(inventory),
      ),
    );

    const totals = await prisma.journalEntryLine.aggregate({
      where: { journalEntry: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    });
    const totalDebit = totals._sum.debit ?? ZERO;
    const totalCredit = totals._sum.credit ?? ZERO;
    return {
      items,
      balanced: totalDebit.eq(totalCredit),
      totalDebit: money(totalDebit),
      totalCredit: money(totalCredit),
    };
  }
}
