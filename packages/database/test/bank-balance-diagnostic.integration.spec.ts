import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { prisma, cleanTestDatabase, Prisma } from '../src';
import {
  accountsWithDifferences,
  buildBankBalanceReport,
  renderBankBalanceCsv,
  renderBankBalanceMarkdown,
  type BankBalanceReport,
} from '../src/diagnostics/bank-balances';

const money = (value: string) => new Prisma.Decimal(value);

/**
 * Diagnóstico de saldos bancarios contra PostgreSQL real: diferencias por cuenta, saldos
 * iniciales sin asiento y asientos duplicados, en una sesión que no puede escribir.
 */
describe('Diagnóstico de saldos bancarios (solo lectura)', () => {
  let client: Client;
  let report: BankBalanceReport;
  let userId: string;
  const ids: Record<string, string> = {};

  async function account(code: string, name: string, type: 'ASSET' | 'EQUITY' | 'INCOME') {
    return (
      await prisma.account.create({ data: { code, name, type, level: 1, allowsMovement: true } })
    ).id;
  }

  /** Asiento publicado como lo hace el motor: borrador, líneas y publicación. */
  async function post(
    entryDate: string,
    description: string,
    source: [string, string],
    lines: Array<[string, string, string]>,
    reversalOfId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          entryDate: new Date(`${entryDate}T00:00:00.000Z`),
          description,
          sourceType: source[0],
          sourceId: source[1],
          reversalOfId,
          reversalReason: reversalOfId ? 'Venta duplicada' : undefined,
        },
      });
      await tx.journalEntryLine.createMany({
        data: lines.map(([accountId, debit, credit], index) => ({
          journalEntryId: entry.id,
          position: index + 1,
          accountId,
          debit: money(debit),
          credit: money(credit),
        })),
      });
      return tx.journalEntry.update({
        where: { id: entry.id },
        data: { status: 'POSTED', postedAt: new Date() },
      });
    });
  }

  async function movement(
    bankAccountId: string,
    before: string,
    after: string,
    extra: object = {},
  ) {
    return prisma.bankMovement.create({
      data: {
        bankAccountId,
        movementType: Number(after) >= Number(before) ? 'DEPOSIT' : 'WITHDRAWAL',
        amount: money(Math.abs(Number(after) - Number(before)).toFixed(2)),
        balanceBefore: money(before),
        balanceAfter: money(after),
        concept: 'Movimiento de prueba',
        createdById: userId,
        ...extra,
      },
    });
  }

  beforeAll(async () => {
    await cleanTestDatabase();
    userId = (await prisma.user.create({ data: { username: 'diag_bancos', passwordHash: 'x' } }))
      .id;
    ids.ledgerA = await account('11100501', 'Bancolombia ahorros', 'ASSET');
    ids.ledgerB = await account('11100502', 'Davivienda corriente', 'ASSET');
    ids.bankGeneral = await account('11100599', 'Bancos (general)', 'ASSET');
    ids.capital = await account('31050501', 'Capital', 'EQUITY');
    ids.income = await account('41350501', 'Ventas', 'INCOME');
    await prisma.companyAccountingMapping.create({
      data: { purpose: 'BANK', accountId: ids.bankGeneral, status: 'ACTIVE' },
    });

    // A: saldo inicial de 500.000 con movimiento pero sin asiento; un depósito de 100.000 con asiento
    const a = await prisma.bankAccount.create({
      data: {
        bankName: 'Bancolombia',
        accountType: 'AHORROS',
        accountNumber: '001',
        name: 'Ahorros principal',
        initialBalance: money('500000.00'),
        currentBalance: money('600000.00'),
        ledgerAccountId: ids.ledgerA,
        createdById: userId,
      },
    });
    ids.bankA = a.id;
    await movement(a.id, '0.00', '500000.00', { referenceDocumentType: 'INITIAL_BALANCE' });
    const deposit = await movement(a.id, '500000.00', '600000.00');
    await post(
      '2026-10-05',
      'Aporte de socio',
      ['BANK_MOVEMENT', deposit.id],
      [
        [ids.ledgerA, '100000.00', '0.00'],
        [ids.capital, '0.00', '100000.00'],
      ],
    );

    // B: saldo inicial respaldado por el asistente; dos ventas idénticas (duplicado) y una
    // tercera igual que ya se reversó (no cuenta)
    const b = await prisma.bankAccount.create({
      data: {
        bankName: 'Davivienda',
        accountType: 'CORRIENTE',
        accountNumber: '002',
        name: 'Corriente',
        initialBalance: money('200000.00'),
        currentBalance: money('200000.00'),
        ledgerAccountId: ids.ledgerB,
        createdById: userId,
      },
    });
    ids.bankB = b.id;
    await movement(b.id, '0.00', '200000.00', { referenceDocumentType: 'INITIAL_BALANCE' });
    await post(
      '2026-10-01',
      'Saldos iniciales',
      ['OPENING_BALANCE', 'OPENING-1'],
      [
        [ids.ledgerB, '200000.00', '0.00'],
        [ids.capital, '0.00', '200000.00'],
      ],
    );
    const sale = (n: string) =>
      post(
        '2026-10-10',
        'Venta por transferencia FAC-000010',
        ['SALE', `sale-${n}`],
        [
          [ids.ledgerB, '50000.00', '0.00'],
          [ids.income, '0.00', '50000.00'],
        ],
      );
    await sale('1');
    await sale('2');
    const reversed = await sale('3');
    await post(
      '2026-10-11',
      'Reversión',
      ['REVERSAL', reversed.id],
      [
        [ids.ledgerB, '0.00', '50000.00'],
        [ids.income, '50000.00', '0.00'],
      ],
      reversed.id,
    );
    // Misma fecha y líneas, otra descripción: confianza media
    await post(
      '2026-10-12',
      'Transferencia cliente A',
      ['SALE', 'sale-4'],
      [
        [ids.ledgerB, '7000.00', '0.00'],
        [ids.income, '0.00', '7000.00'],
      ],
    );
    await post(
      '2026-10-12',
      'Transferencia cliente B',
      ['SALE', 'sale-5'],
      [
        [ids.ledgerB, '7000.00', '0.00'],
        [ids.income, '0.00', '7000.00'],
      ],
    );

    // C: sin subcuenta propia; saldo registrado sin movimientos y con la cadena rota
    const c = await prisma.bankAccount.create({
      data: {
        bankName: 'BBVA',
        accountType: 'AHORROS',
        accountNumber: '003',
        name: 'Nómina',
        currentBalance: money('30000.00'),
        createdById: userId,
      },
    });
    ids.bankC = c.id;
    await movement(c.id, '0.00', '10000.00');
    await movement(c.id, '15000.00', '20000.00');

    client = new Client({
      connectionString: process.env.DATABASE_URL,
      options: '-c default_transaction_read_only=on',
    });
    await client.connect();
    report = await buildBankBalanceReport(client, new Date('2026-11-02T12:00:00.000Z'));
  });

  afterAll(async () => {
    await client?.end();
    await cleanTestDatabase();
  });

  const row = (id: string) => report.accounts.find((a) => a.bankAccountId === id)!;

  it('corre en una transacción de solo lectura y no puede escribir', async () => {
    expect(report.transactionReadOnly).toBe('on');
    await expect(client.query(`UPDATE bank_accounts SET current_balance = 0`)).rejects.toThrow(
      /read-only transaction/,
    );
    expect(
      (
        await prisma.bankAccount.findUniqueOrThrow({ where: { id: ids.bankA } })
      ).currentBalance.toFixed(2),
    ).toBe('600000.00');
  });

  it('compara por cuenta el saldo registrado con los movimientos y con el saldo contable', () => {
    expect(row(ids.bankA)).toMatchObject({
      registeredBalance: '600000.00',
      movementsBalance: '600000.00',
      movementsDifference: '0.00',
      ledgerBalance: '100000.00',
      ledgerDifference: '500000.00',
      chainBreaks: 0,
      ledgerAccountCode: '11100501',
    });
    // 200.000 iniciales + dos ventas vigentes de 50.000 + dos de 7.000 (la reversada se anula)
    expect(row(ids.bankB)).toMatchObject({
      ledgerBalance: '314000.00',
      ledgerDifference: '-114000.00',
    });
    expect(row(ids.bankC)).toMatchObject({
      registeredBalance: '30000.00',
      movementsBalance: '15000.00',
      movementsDifference: '15000.00',
      ledgerBalance: null,
      ledgerDifference: null,
      chainBreaks: 1,
    });
    expect(
      accountsWithDifferences(report)
        .map((a) => a.bankAccountId)
        .sort(),
    ).toEqual([ids.bankA, ids.bankB, ids.bankC].sort());
  });

  it('agrupa las cuentas sin subcuenta contra la cuenta del propósito BANK y totaliza', () => {
    expect(report.sharedPool).toEqual({
      ledgerAccountCode: '11100599',
      ledgerAccountName: 'Bancos (general)',
      bankAccounts: 1,
      registeredBalance: '30000.00',
      ledgerBalance: '0.00',
      difference: '30000.00',
    });
    expect(report.totals).toEqual({
      registeredBalance: '830000.00',
      ledgerBalance: '414000.00',
      difference: '416000.00',
    });
  });

  it('lista los saldos iniciales sin asiento y los respaldados por el asistente', () => {
    const byAccount = Object.fromEntries(report.initialBalances.map((i) => [i.bankAccountId, i]));
    expect(byAccount[ids.bankA]).toMatchObject({
      status: 'SIN_ASIENTO',
      ownEntries: 0,
      movementAmount: '500000.00',
    });
    expect(byAccount[ids.bankB]).toMatchObject({
      status: 'RESPALDADO_POR_ASISTENTE',
      openingBalanceNet: '200000.00',
    });
    expect(byAccount[ids.bankC]).toBeUndefined();
  });

  it('detecta asientos duplicados vigentes y deja fuera los reversados', () => {
    expect(report.duplicateEntries).toHaveLength(2);
    const [high, medium] = report.duplicateEntries;
    expect(high).toMatchObject({ confidence: 'ALTA', entryDate: '2026-10-10', amount: '50000.00' });
    expect(high.entries.map((e) => e.sourceId).sort()).toEqual(['sale-1', 'sale-2']);
    expect(medium).toMatchObject({ confidence: 'MEDIA', entryDate: '2026-10-12' });
    expect(medium.entries.map((e) => e.sourceId).sort()).toEqual(['sale-4', 'sale-5']);
  });

  it('genera el reporte en markdown y en CSV', () => {
    const markdown = renderBankBalanceMarkdown(report);
    expect(markdown).toContain('Transacción de solo lectura: on');
    expect(markdown).toContain('Cuentas bancarias: 3; con diferencias: 3');
    expect(markdown).toMatch(
      /\| Bancolombia \| Ahorros principal \| 001 \| 11100501 Bancolombia ahorros \| 600000\.00 \|/,
    );
    expect(markdown).toContain('### 2026-10-10 · 50000.00 · confianza ALTA');

    const files = renderBankBalanceCsv(report);
    expect(Object.keys(files).sort()).toEqual([
      'asientos-duplicados.csv',
      'saldos-iniciales.csv',
      'saldos-por-cuenta.csv',
    ]);
    expect(files['saldos-por-cuenta.csv'].split('\n')[0]).toBe(
      'banco,cuenta,numero,activa,subcuenta_puc,registrado,movimientos,cantidad_movimientos,dif_movimientos,contable,dif_contable,saltos_cadena',
    );
    expect(files['saldos-iniciales.csv']).toContain('SIN_ASIENTO');
    expect(files['asientos-duplicados.csv'].trim().split('\n')).toHaveLength(5);
  });
});
