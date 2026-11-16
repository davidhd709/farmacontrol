/**
 * Arquitectura — ningún módulo escribe tablas de negocio de otro (AGENTS.md §5).
 *
 * Inventario, caja, cartera, cuentas por pagar, clientes, proveedores, tesorería, ventas,
 * compras, contabilidad, catálogo, terceros, gastos y empresa sólo se modifican desde su propio
 * módulo; los demás usan sus contratos transaccionales (InventoryLedger, CashService,
 * ReceivablesLedger, PayablesLedger, CustomersLedger, SuppliersLedger, ThirdPartyService,
 * recordSourceBankMovement, JournalService…). Leer tablas ajenas está permitido.
 *
 * La auditoría también: los módulos registran sus eventos con `recordAuditEvent` o
 * `AuditService`. Fuera de la lista quedan los perfiles tributarios de producto, que hoy
 * gestiona contabilidad.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULES_DIR = join(__dirname, '../../src/modules');

/** Delegado de Prisma y tabla SQL → módulo dueño. */
const OWNED_TABLES: Array<{ delegate: string; table: string; owner: string }> = [
  { delegate: 'inventoryLot', table: 'inventory_lots', owner: 'inventory' },
  { delegate: 'inventoryMovement', table: 'inventory_movements', owner: 'inventory' },
  { delegate: 'location', table: 'locations', owner: 'inventory' },
  { delegate: 'inventoryCostBalance', table: 'inventory_cost_balances', owner: 'inventory' },
  {
    delegate: 'inventoryValuationMovement',
    table: 'inventory_valuation_movements',
    owner: 'inventory',
  },
  { delegate: 'cashMovement', table: 'cash_movements', owner: 'cash' },
  { delegate: 'receivable', table: 'receivables', owner: 'receivables' },
  { delegate: 'receivablePayment', table: 'receivable_payments', owner: 'receivables' },
  { delegate: 'payable', table: 'payables', owner: 'payables' },
  { delegate: 'payablePayment', table: 'payable_payments', owner: 'payables' },
  { delegate: 'customer', table: 'customers', owner: 'customers' },
  { delegate: 'supplier', table: 'suppliers', owner: 'suppliers' },
  { delegate: 'bankAccount', table: 'bank_accounts', owner: 'treasury' },
  { delegate: 'bankMovement', table: 'bank_movements', owner: 'treasury' },
  { delegate: 'treasuryDocument', table: 'treasury_documents', owner: 'treasury' },
  { delegate: 'sale', table: 'sales', owner: 'sales' },
  { delegate: 'saleLine', table: 'sale_lines', owner: 'sales' },
  { delegate: 'saleLotAllocation', table: 'sale_lot_allocations', owner: 'sales' },
  { delegate: 'creditNote', table: 'credit_notes', owner: 'sales' },
  { delegate: 'creditNoteLine', table: 'credit_note_lines', owner: 'sales' },
  { delegate: 'purchase', table: 'purchases', owner: 'purchases' },
  { delegate: 'purchaseLine', table: 'purchase_lines', owner: 'purchases' },
  { delegate: 'debitNote', table: 'debit_notes', owner: 'purchases' },
  { delegate: 'debitNoteLine', table: 'debit_note_lines', owner: 'purchases' },
  { delegate: 'journalEntry', table: 'journal_entries', owner: 'accounting' },
  { delegate: 'journalEntryLine', table: 'journal_entry_lines', owner: 'accounting' },
  { delegate: 'account', table: 'accounts', owner: 'accounting' },
  {
    delegate: 'companyAccountingMapping',
    table: 'company_accounting_mappings',
    owner: 'accounting',
  },
  { delegate: 'fiscalPeriod', table: 'fiscal_periods', owner: 'accounting' },
  { delegate: 'documentLock', table: 'document_locks', owner: 'accounting' },
  { delegate: 'product', table: 'products', owner: 'catalog' },
  { delegate: 'productPresentation', table: 'product_presentations', owner: 'catalog' },
  { delegate: 'category', table: 'categories', owner: 'catalog' },
  { delegate: 'thirdParty', table: 'third_parties', owner: 'third-parties' },
  { delegate: 'expense', table: 'expenses', owner: 'expenses' },
  { delegate: 'expensePayment', table: 'expense_payments', owner: 'expenses' },
  { delegate: 'company', table: 'companies', owner: 'company' },
  { delegate: 'branch', table: 'branches', owner: 'company' },
  { delegate: 'auditEvent', table: 'audit_events', owner: 'audit' },
];

const WRITE_METHODS = 'create|createMany|update|updateMany|upsert|delete|deleteMany';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

function foreignWrites(): string[] {
  const violations: string[] = [];
  for (const file of sourceFiles(MODULES_DIR)) {
    const module = relative(MODULES_DIR, file).split(sep)[0];
    const source = readFileSync(file, 'utf8');
    for (const { delegate, table, owner } of OWNED_TABLES) {
      if (module === owner) continue;
      const prismaWrite = new RegExp(`\\.${delegate}\\.(${WRITE_METHODS})\\(`);
      const sqlWrite = new RegExp(`(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"?${table}"?\\b`, 'i');
      if (prismaWrite.test(source) || sqlWrite.test(source)) {
        violations.push(`${relative(MODULES_DIR, file)} escribe ${table} (dueño: ${owner})`);
      }
    }
  }
  return violations;
}

describe('Límites entre módulos', () => {
  it('ningún módulo escribe directamente tablas de negocio de otro módulo', () => {
    expect(foreignWrites()).toEqual([]);
  });

  it('el detector reconoce una escritura ajena', () => {
    const prismaWrite = new RegExp(`\\.inventoryLot\\.(${WRITE_METHODS})\\(`);
    expect(prismaWrite.test('await tx.inventoryLot.update({ where })')).toBe(true);
    expect(prismaWrite.test('await tx.inventoryLot.findMany({ where })')).toBe(false);
  });
});
