import type { ClientBase } from 'pg';

/**
 * Diagnóstico de saldos bancarios, de SOLO LECTURA (correcciones del cliente, 2026-11-02).
 *
 * Por cuenta bancaria compara el saldo registrado (`bank_accounts.current_balance`) con el
 * auxiliar de sus movimientos y con el saldo contable de su subcuenta del PUC; lista los saldos
 * iniciales sin asiento y los asientos posiblemente duplicados sobre cuentas de bancos. Todo el
 * dinero se calcula en SQL con `numeric` y viaja como texto: nunca pasa por coma flotante.
 *
 * Se ejecuta en una transacción READ ONLY con instantánea REPEATABLE READ; la conexión de la
 * CLI además fija `default_transaction_read_only=on`. Pensado para una COPIA de la base del
 * cliente, nunca para producción.
 */

export interface BankAccountBalanceRow {
  bankAccountId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  isActive: boolean;
  ledgerAccountCode: string | null;
  ledgerAccountName: string | null;
  /** Saldo que muestra Tesorería (`current_balance`). */
  registeredBalance: string;
  /** Suma de los movimientos bancarios (saldo inicial incluido, si generó movimiento). */
  movementsBalance: string;
  movementsCount: number;
  /** Movimientos cuyo saldo anterior no coincide con el saldo posterior del movimiento previo. */
  chainBreaks: number;
  /** Débitos − créditos publicados en su subcuenta; null si no tiene subcuenta asignada. */
  ledgerBalance: string | null;
  /** registrado − movimientos */
  movementsDifference: string;
  /** registrado − contable; null si no tiene subcuenta asignada. */
  ledgerDifference: string | null;
}

/** Cuentas sin subcuenta propia: sus asientos van a la cuenta del propósito BANK. */
export interface SharedBankPoolRow {
  ledgerAccountCode: string | null;
  ledgerAccountName: string | null;
  bankAccounts: number;
  registeredBalance: string;
  ledgerBalance: string | null;
  difference: string | null;
}

export interface InitialBalanceRow {
  bankAccountId: string;
  bankName: string;
  accountName: string;
  initialBalance: string;
  movementId: string | null;
  movementAmount: string | null;
  movementDate: string | null;
  /** Asientos publicados cuyo origen es el movimiento inicial o la cuenta bancaria. */
  ownEntries: number;
  /** Neto vigente de los saldos iniciales del asistente contable en la cuenta contable del banco. */
  openingBalanceNet: string;
  status:
    | 'SIN_ASIENTO'
    | 'RESPALDADO_POR_ASISTENTE'
    | 'RESPALDO_PARCIAL'
    | 'CON_ASIENTO_PROPIO'
    | 'SIN_MOVIMIENTO';
}

export interface DuplicateEntryGroup {
  /** ALTA: misma fecha, líneas y descripción. MEDIA: misma fecha y líneas. */
  confidence: 'ALTA' | 'MEDIA';
  entryDate: string;
  amount: string;
  description: string;
  entries: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    description: string;
    postedAt: string | null;
  }>;
}

export interface BankBalanceReport {
  generatedAt: string;
  databaseName: string;
  /** `transaction_read_only` de la sesión durante las consultas: debe ser "on". */
  transactionReadOnly: string;
  accounts: BankAccountBalanceRow[];
  sharedPool: SharedBankPoolRow | null;
  totals: { registeredBalance: string; ledgerBalance: string; difference: string };
  initialBalances: InitialBalanceRow[];
  duplicateEntries: DuplicateEntryGroup[];
}

const ACCOUNTS_SQL = `
WITH chain AS (
  SELECT m.bank_account_id,
         m.balance_before,
         LAG(m.balance_after) OVER (PARTITION BY m.bank_account_id ORDER BY m.created_at, m.id) AS previous_after
  FROM bank_movements m
)
SELECT b.id AS bank_account_id,
       b.bank_name,
       b.name AS account_name,
       b.account_number,
       b.is_active,
       a.code AS ledger_account_code,
       a.name AS ledger_account_name,
       b.current_balance::numeric(20,2)::text AS registered_balance,
       COALESCE(mv.net, 0)::numeric(20,2)::text AS movements_balance,
       COALESCE(mv.count, 0)::int AS movements_count,
       (SELECT count(*) FROM chain c
         WHERE c.bank_account_id = b.id AND c.previous_after IS NOT NULL
           AND c.balance_before <> c.previous_after)::int AS chain_breaks,
       CASE WHEN b.ledger_account_id IS NULL THEN NULL ELSE COALESCE(lg.net, 0)::numeric(20,2)::text END AS ledger_balance,
       (b.current_balance - COALESCE(mv.net, 0))::numeric(20,2)::text AS movements_difference,
       CASE WHEN b.ledger_account_id IS NULL THEN NULL
            ELSE (b.current_balance - COALESCE(lg.net, 0))::numeric(20,2)::text END AS ledger_difference
FROM bank_accounts b
LEFT JOIN accounts a ON a.id = b.ledger_account_id
LEFT JOIN LATERAL (
  SELECT SUM(m.balance_after - m.balance_before) AS net, count(*) AS count
  FROM bank_movements m WHERE m.bank_account_id = b.id
) mv ON true
LEFT JOIN LATERAL (
  SELECT SUM(l.debit - l.credit) AS net
  FROM journal_entry_lines l
  JOIN journal_entries j ON j.id = l.journal_entry_id AND j.status = 'POSTED'
  WHERE l.account_id = b.ledger_account_id
) lg ON true
ORDER BY b.bank_name, b.name, b.id`;

/** Cuentas contables de bancos: las subcuentas asignadas y la del propósito BANK vigente. */
const BANK_LEDGERS_CTE = `
bank_ledgers AS (
  SELECT ledger_account_id AS account_id FROM bank_accounts WHERE ledger_account_id IS NOT NULL
  UNION
  SELECT account_id FROM company_accounting_mappings
  WHERE purpose = 'BANK' AND status = 'ACTIVE' AND account_id IS NOT NULL
)`;

const SHARED_POOL_SQL = `
WITH pool AS (
  SELECT count(*)::int AS bank_accounts, COALESCE(SUM(current_balance), 0) AS registered
  FROM bank_accounts WHERE ledger_account_id IS NULL
),
mapping AS (
  SELECT m.account_id, a.code, a.name
  FROM company_accounting_mappings m JOIN accounts a ON a.id = m.account_id
  WHERE m.purpose = 'BANK' AND m.status = 'ACTIVE'
  ORDER BY m.effective_from DESC LIMIT 1
),
ledger AS (
  SELECT SUM(l.debit - l.credit) AS net
  FROM journal_entry_lines l
  JOIN journal_entries j ON j.id = l.journal_entry_id AND j.status = 'POSTED'
  WHERE l.account_id = (SELECT account_id FROM mapping)
)
SELECT pool.bank_accounts,
       pool.registered::numeric(20,2)::text AS registered_balance,
       (SELECT code FROM mapping) AS ledger_account_code,
       (SELECT name FROM mapping) AS ledger_account_name,
       CASE WHEN EXISTS (SELECT 1 FROM mapping) THEN COALESCE((SELECT net FROM ledger), 0)::numeric(20,2)::text END AS ledger_balance,
       CASE WHEN EXISTS (SELECT 1 FROM mapping)
            THEN (pool.registered - COALESCE((SELECT net FROM ledger), 0))::numeric(20,2)::text END AS difference
FROM pool`;

const TOTALS_SQL = `
WITH ${BANK_LEDGERS_CTE}
SELECT (SELECT COALESCE(SUM(current_balance), 0) FROM bank_accounts)::numeric(20,2)::text AS registered_balance,
       COALESCE((SELECT SUM(l.debit - l.credit) FROM journal_entry_lines l
                  JOIN journal_entries j ON j.id = l.journal_entry_id AND j.status = 'POSTED'
                 WHERE l.account_id IN (SELECT account_id FROM bank_ledgers)), 0)::numeric(20,2)::text AS ledger_balance,
       ((SELECT COALESCE(SUM(current_balance), 0) FROM bank_accounts)
        - COALESCE((SELECT SUM(l.debit - l.credit) FROM journal_entry_lines l
                     JOIN journal_entries j ON j.id = l.journal_entry_id AND j.status = 'POSTED'
                    WHERE l.account_id IN (SELECT account_id FROM bank_ledgers)), 0))::numeric(20,2)::text AS difference`;

const INITIAL_BALANCES_SQL = `
WITH bank_mapping AS (
  SELECT account_id FROM company_accounting_mappings
  WHERE purpose = 'BANK' AND status = 'ACTIVE' AND account_id IS NOT NULL
  ORDER BY effective_from DESC LIMIT 1
),
opening AS (
  -- Saldos iniciales del asistente que siguen vigentes (sin reversión)
  SELECT l.account_id, SUM(l.debit - l.credit) AS net
  FROM journal_entries j
  JOIN journal_entry_lines l ON l.journal_entry_id = j.id
  WHERE j.source_type = 'OPENING_BALANCE' AND j.status = 'POSTED'
    AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reversal_of_id = j.id)
  GROUP BY l.account_id
)
SELECT x.*,
       x.opening_net = COALESCE(x.movement_amount_num, x.initial_balance_num) AS opening_matches,
       x.opening_net <> 0 AS opening_nonzero,
       x.opening_net::numeric(20,2)::text AS opening_balance_net
FROM (
SELECT b.id AS bank_account_id,
       b.bank_name,
       b.name AS account_name,
       b.initial_balance::numeric(20,2)::text AS initial_balance,
       b.initial_balance AS initial_balance_num,
       m.amount AS movement_amount_num,
       m.id AS movement_id,
       m.amount::numeric(20,2)::text AS movement_amount,
       to_char(m.movement_date AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS movement_date,
       (SELECT count(*) FROM journal_entries j
         WHERE j.status = 'POSTED'
           AND j.source_id IN (COALESCE(m.id::text, ''), b.id::text))::int AS own_entries,
       COALESCE((SELECT o.net FROM opening o
                  WHERE o.account_id = COALESCE(b.ledger_account_id, (SELECT account_id FROM bank_mapping))), 0)
         AS opening_net
FROM bank_accounts b
LEFT JOIN bank_movements m ON m.bank_account_id = b.id AND m.reference_document_type = 'INITIAL_BALANCE'
WHERE b.initial_balance <> 0 OR m.id IS NOT NULL
) x
ORDER BY x.bank_name, x.account_name, x.bank_account_id`;

/**
 * Asientos publicados y vigentes (ni reversados ni reversiones) que tocan cuentas de bancos y
 * comparten fecha y líneas. Dos ventas iguales el mismo día también coinciden en líneas, por eso
 * la confianza ALTA exige además la misma descripción: son candidatos a revisar, no a borrar.
 */
const DUPLICATES_SQL = `
WITH ${BANK_LEDGERS_CTE},
live AS (
  SELECT j.* FROM journal_entries j
  WHERE j.status = 'POSTED'
    AND j.reversal_of_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reversal_of_id = j.id)
    AND EXISTS (SELECT 1 FROM journal_entry_lines l
                 WHERE l.journal_entry_id = j.id AND l.account_id IN (SELECT account_id FROM bank_ledgers))
),
fingerprints AS (
  SELECT j.id, j.entry_date, j.description, j.source_type, j.source_id, j.posted_at,
         string_agg(l.account_id::text || ':' || l.debit::text || ':' || l.credit::text, '|'
                    ORDER BY l.account_id, l.debit, l.credit) AS lines,
         SUM(l.debit)::numeric(20,2)::text AS amount
  FROM live j JOIN journal_entry_lines l ON l.journal_entry_id = j.id
  GROUP BY j.id, j.entry_date, j.description, j.source_type, j.source_id, j.posted_at
)
SELECT to_char(f.entry_date, 'YYYY-MM-DD') AS entry_date,
       f.lines,
       f.amount,
       count(DISTINCT f.description) = 1 AS same_description,
       min(f.description) AS description,
       json_agg(json_build_object(
         'id', f.id, 'sourceType', f.source_type, 'sourceId', f.source_id,
         'description', f.description, 'postedAt', f.posted_at
       ) ORDER BY f.posted_at, f.id) AS entries
FROM fingerprints f
GROUP BY f.entry_date, f.lines, f.amount
HAVING count(*) > 1
ORDER BY f.entry_date, f.amount`;

function classifyInitial(row: {
  movement_id: string | null;
  own_entries: number;
  opening_matches: boolean;
  opening_nonzero: boolean;
}): InitialBalanceRow['status'] {
  if (!row.movement_id) return 'SIN_MOVIMIENTO';
  if (row.own_entries > 0) return 'CON_ASIENTO_PROPIO';
  if (row.opening_matches) return 'RESPALDADO_POR_ASISTENTE';
  if (row.opening_nonzero) return 'RESPALDO_PARCIAL';
  return 'SIN_ASIENTO';
}

/**
 * Arma el reporte dentro de una transacción de solo lectura. Si el cliente no está en una
 * sesión de solo lectura, PostgreSQL rechazará cualquier escritura de todos modos por el
 * `READ ONLY` de la transacción.
 */
export async function buildBankBalanceReport(
  client: ClientBase,
  now: Date = new Date(),
): Promise<BankBalanceReport> {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const meta = await client.query<{ db: string; ro: string }>(
      `SELECT current_database() AS db, current_setting('transaction_read_only') AS ro`,
    );
    const accounts = await client.query(ACCOUNTS_SQL);
    const pool = await client.query(SHARED_POOL_SQL);
    const totals = await client.query(TOTALS_SQL);
    const initial = await client.query(INITIAL_BALANCES_SQL);
    const duplicates = await client.query(DUPLICATES_SQL);

    const poolRow = pool.rows[0];
    return {
      generatedAt: now.toISOString(),
      databaseName: meta.rows[0].db,
      transactionReadOnly: meta.rows[0].ro,
      accounts: accounts.rows.map((r) => ({
        bankAccountId: r.bank_account_id,
        bankName: r.bank_name,
        accountName: r.account_name,
        accountNumber: r.account_number,
        isActive: r.is_active,
        ledgerAccountCode: r.ledger_account_code,
        ledgerAccountName: r.ledger_account_name,
        registeredBalance: r.registered_balance,
        movementsBalance: r.movements_balance,
        movementsCount: r.movements_count,
        chainBreaks: r.chain_breaks,
        ledgerBalance: r.ledger_balance,
        movementsDifference: r.movements_difference,
        ledgerDifference: r.ledger_difference,
      })),
      sharedPool:
        poolRow && poolRow.bank_accounts > 0
          ? {
              ledgerAccountCode: poolRow.ledger_account_code,
              ledgerAccountName: poolRow.ledger_account_name,
              bankAccounts: poolRow.bank_accounts,
              registeredBalance: poolRow.registered_balance,
              ledgerBalance: poolRow.ledger_balance,
              difference: poolRow.difference,
            }
          : null,
      totals: {
        registeredBalance: totals.rows[0].registered_balance,
        ledgerBalance: totals.rows[0].ledger_balance,
        difference: totals.rows[0].difference,
      },
      initialBalances: initial.rows.map((r) => ({
        bankAccountId: r.bank_account_id,
        bankName: r.bank_name,
        accountName: r.account_name,
        initialBalance: r.initial_balance,
        movementId: r.movement_id,
        movementAmount: r.movement_amount,
        movementDate: r.movement_date,
        ownEntries: r.own_entries,
        openingBalanceNet: r.opening_balance_net,
        status: classifyInitial(r),
      })),
      duplicateEntries: duplicates.rows.map((r) => ({
        confidence: r.same_description ? 'ALTA' : 'MEDIA',
        entryDate: r.entry_date,
        amount: r.amount,
        description: r.description,
        entries: r.entries,
      })),
    };
  } finally {
    await client.query('ROLLBACK');
  }
}

const isZero = (value: string | null) => value === null || /^-?0+(\.0+)?$/.test(value);

/** Filas con alguna diferencia o con la cadena de saldos rota. */
export function accountsWithDifferences(report: BankBalanceReport): BankAccountBalanceRow[] {
  return report.accounts.filter(
    (a) => !isZero(a.movementsDifference) || !isZero(a.ledgerDifference) || a.chainBreaks > 0,
  );
}

const STATUS_LABEL: Record<InitialBalanceRow['status'], string> = {
  SIN_ASIENTO: 'Sin asiento',
  RESPALDADO_POR_ASISTENTE: 'Sin asiento propio; respaldado por saldos iniciales del asistente',
  RESPALDO_PARCIAL: 'Sin asiento propio; el asistente tiene otro valor',
  CON_ASIENTO_PROPIO: 'Con asiento propio',
  SIN_MOVIMIENTO: 'Saldo inicial sin movimiento bancario',
};

const cell = (value: unknown) =>
  String(value ?? '—')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
const table = (headers: string[], rows: unknown[][]) =>
  [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');

export function renderBankBalanceMarkdown(report: BankBalanceReport): string {
  const differences = accountsWithDifferences(report);
  const pendingInitial = report.initialBalances.filter(
    (i) => i.status !== 'CON_ASIENTO_PROPIO' && i.status !== 'RESPALDADO_POR_ASISTENTE',
  );
  const out: string[] = [
    '# Diagnóstico de saldos bancarios (solo lectura)',
    '',
    `- Base: \`${report.databaseName}\``,
    `- Generado: ${report.generatedAt}`,
    `- Transacción de solo lectura: ${report.transactionReadOnly}`,
    '',
    '## Resumen',
    '',
    `- Cuentas bancarias: ${report.accounts.length}; con diferencias: ${differences.length}`,
    `- Saldos iniciales revisados: ${report.initialBalances.length}; sin asiento propio ni respaldo completo: ${pendingInitial.length}`,
    `- Grupos de asientos posiblemente duplicados: ${report.duplicateEntries.length}`,
    `- Total registrado ${report.totals.registeredBalance} frente a total contable de bancos ${report.totals.ledgerBalance} (diferencia ${report.totals.difference})`,
    '',
    '## 1. Saldo registrado frente a movimientos y saldo contable, por cuenta',
    '',
    'Registrado = saldo que muestra Tesorería. Movimientos = suma del auxiliar. Contable = débitos − créditos publicados en su subcuenta del PUC.',
    '',
    table(
      [
        'Banco',
        'Cuenta',
        'Número',
        'Subcuenta PUC',
        'Registrado',
        'Movimientos',
        'Dif. movimientos',
        'Contable',
        'Dif. contable',
        'Saltos en la cadena',
      ],
      report.accounts.map((a) => [
        a.bankName,
        a.accountName + (a.isActive ? '' : ' (inactiva)'),
        a.accountNumber,
        a.ledgerAccountCode
          ? `${a.ledgerAccountCode} ${a.ledgerAccountName ?? ''}`.trim()
          : 'Sin subcuenta',
        a.registeredBalance,
        a.movementsBalance,
        a.movementsDifference,
        a.ledgerBalance,
        a.ledgerDifference,
        a.chainBreaks,
      ]),
    ),
    '',
  ];
  if (report.sharedPool) {
    const p = report.sharedPool;
    out.push(
      '### Cuentas sin subcuenta propia',
      '',
      `Sus asientos van a la cuenta del propósito BANK (${p.ledgerAccountCode ?? 'sin mapear'} ${p.ledgerAccountName ?? ''}); no se pueden separar por cuenta.`,
      '',
      table(
        ['Cuentas bancarias', 'Registrado', 'Contable', 'Diferencia'],
        [[p.bankAccounts, p.registeredBalance, p.ledgerBalance, p.difference]],
      ),
      '',
    );
  }
  out.push(
    '## 2. Saldos iniciales y su asiento',
    '',
    report.initialBalances.length
      ? table(
          [
            'Banco',
            'Cuenta',
            'Saldo inicial',
            'Movimiento',
            'Fecha',
            'Asientos propios',
            'Neto en saldos iniciales del asistente',
            'Estado',
          ],
          report.initialBalances.map((i) => [
            i.bankName,
            i.accountName,
            i.initialBalance,
            i.movementAmount,
            i.movementDate,
            i.ownEntries,
            i.openingBalanceNet,
            STATUS_LABEL[i.status],
          ]),
        )
      : 'Ninguna cuenta bancaria tiene saldo inicial.',
    '',
    '## 3. Asientos posiblemente duplicados en cuentas de bancos',
    '',
    'Asientos vigentes con la misma fecha y las mismas líneas. ALTA: además la misma descripción. Son candidatos a revisar con el contador, no a borrar: se corrigen anulando su documento.',
    '',
  );
  if (!report.duplicateEntries.length) {
    out.push('No se encontraron.', '');
  } else {
    for (const group of report.duplicateEntries) {
      out.push(
        `### ${group.entryDate} · ${group.amount} · confianza ${group.confidence}`,
        '',
        table(
          ['Asiento', 'Origen', 'Id de origen', 'Descripción', 'Publicado'],
          group.entries.map((e) => [e.id, e.sourceType, e.sourceId, e.description, e.postedAt]),
        ),
        '',
      );
    }
  }
  return out.join('\n');
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = (headers: string[], rows: unknown[][]) =>
  [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

/** Un CSV por sección, listo para abrir en Excel. */
export function renderBankBalanceCsv(report: BankBalanceReport): Record<string, string> {
  return {
    'saldos-por-cuenta.csv': csv(
      [
        'banco',
        'cuenta',
        'numero',
        'activa',
        'subcuenta_puc',
        'registrado',
        'movimientos',
        'cantidad_movimientos',
        'dif_movimientos',
        'contable',
        'dif_contable',
        'saltos_cadena',
      ],
      report.accounts.map((a) => [
        a.bankName,
        a.accountName,
        a.accountNumber,
        a.isActive ? 'si' : 'no',
        a.ledgerAccountCode,
        a.registeredBalance,
        a.movementsBalance,
        a.movementsCount,
        a.movementsDifference,
        a.ledgerBalance,
        a.ledgerDifference,
        a.chainBreaks,
      ]),
    ),
    'saldos-iniciales.csv': csv(
      [
        'banco',
        'cuenta',
        'saldo_inicial',
        'movimiento_id',
        'monto_movimiento',
        'fecha',
        'asientos_propios',
        'neto_asistente',
        'estado',
      ],
      report.initialBalances.map((i) => [
        i.bankName,
        i.accountName,
        i.initialBalance,
        i.movementId,
        i.movementAmount,
        i.movementDate,
        i.ownEntries,
        i.openingBalanceNet,
        i.status,
      ]),
    ),
    'asientos-duplicados.csv': csv(
      [
        'grupo',
        'confianza',
        'fecha',
        'monto',
        'asiento_id',
        'origen',
        'origen_id',
        'descripcion',
        'publicado',
      ],
      report.duplicateEntries.flatMap((g, index) =>
        g.entries.map((e) => [
          index + 1,
          g.confidence,
          g.entryDate,
          g.amount,
          e.id,
          e.sourceType,
          e.sourceId,
          e.description,
          e.postedAt,
        ]),
      ),
    ),
  };
}
