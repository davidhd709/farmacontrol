-- Diagnóstico de saldos iniciales bancarios (solo lectura). Correcciones del cliente, 2026-11-02.
-- Ejecutar antes de unificar la fuente del saldo inicial en el asistente contable:
--   psql "$DATABASE_URL" -f infra/scripts/diagnostics/saldos-iniciales-bancarios.sql

\echo '1. Cuentas bancarias con saldo inicial y si tienen movimiento y asiento'
SELECT b.name AS cuenta_bancaria,
       b.bank_name AS banco,
       b.initial_balance AS saldo_inicial,
       b.current_balance AS saldo_auxiliar,
       a.code AS subcuenta_puc,
       m.id IS NOT NULL AS tiene_movimiento_inicial,
       (SELECT count(*) FROM journal_entries j
         WHERE j.source_id IN (m.id::text, b.id::text) AND j.status = 'POSTED') AS asientos_del_saldo_inicial,
       b.created_at::date AS creada
FROM bank_accounts b
LEFT JOIN accounts a ON a.id = b.ledger_account_id
LEFT JOIN bank_movements m
       ON m.bank_account_id = b.id AND m.reference_document_type = 'INITIAL_BALANCE'
WHERE b.initial_balance <> 0 OR m.id IS NOT NULL
ORDER BY b.created_at;

\echo '2. Saldos iniciales del asistente contable vigentes (no reversados) y su neto en bancos (1110 y subcuentas)'
SELECT j.id, j.entry_date, j.source_id,
       COALESCE(SUM(l.debit - l.credit) FILTER (WHERE a.code LIKE '1110%'), 0) AS neto_bancos
FROM journal_entries j
JOIN journal_entry_lines l ON l.journal_entry_id = j.id
JOIN accounts a ON a.id = l.account_id
WHERE j.source_type = 'OPENING_BALANCE' AND j.status = 'POSTED'
  AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reversal_of_id = j.id)
GROUP BY j.id, j.entry_date, j.source_id;

\echo '3. Por cuenta bancaria: saldo auxiliar frente al saldo contable de su subcuenta'
SELECT b.name AS cuenta_bancaria,
       b.current_balance AS saldo_auxiliar,
       a.code AS subcuenta_puc,
       COALESCE((SELECT SUM(l.debit - l.credit)
                   FROM journal_entry_lines l
                   JOIN journal_entries j ON j.id = l.journal_entry_id AND j.status = 'POSTED'
                  WHERE l.account_id = b.ledger_account_id), 0) AS saldo_contable
FROM bank_accounts b
LEFT JOIN accounts a ON a.id = b.ledger_account_id
ORDER BY b.created_at;
