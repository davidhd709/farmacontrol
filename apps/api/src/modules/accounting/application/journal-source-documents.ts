import { prisma } from '@farmacia/database';
import type { JournalSourceDocumentDto } from '@farmacia/contracts';

interface EntryRef {
  id: string;
  sourceType: string;
  sourceId: string;
  reversalOfId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const search = (path: string, number: string) => `${path}?buscar=${encodeURIComponent(number)}`;
const treasuryHref = (number: string) =>
  search(number.startsWith('CE-') ? '/treasury/disbursements' : '/treasury/receipts', number);

/**
 * Número legible del documento que originó cada asiento (FAC-000007, NC-000001, RC-000003…) y
 * la pantalla donde se consulta (correcciones del cliente, 2026-11-02: el Libro Diario no debe
 * mostrar el UUID interno). Es una consulta de solo lectura sobre los documentos de los otros
 * módulos; una reversión muestra el documento del asiento que reversa.
 */
export async function resolveSourceDocuments(
  entries: EntryRef[],
): Promise<Map<string, JournalSourceDocumentDto>> {
  const originals = new Map<string, EntryRef>();
  const reversalIds = entries
    .filter((e) => e.sourceType === 'REVERSAL' && e.reversalOfId)
    .map((e) => e.reversalOfId!);
  if (reversalIds.length) {
    const rows = await prisma.journalEntry.findMany({
      where: { id: { in: reversalIds } },
      select: { id: true, sourceType: true, sourceId: true, reversalOfId: true },
    });
    for (const row of rows) originals.set(row.id, row);
  }
  const effective = (entry: EntryRef) =>
    entry.sourceType === 'REVERSAL' && entry.reversalOfId
      ? (originals.get(entry.reversalOfId) ?? entry)
      : entry;

  const ids = (types: string[]) =>
    Array.from(
      new Set(
        entries
          .map(effective)
          .filter((e) => types.includes(e.sourceType) && UUID.test(e.sourceId))
          .map((e) => e.sourceId),
      ),
    );

  const [
    sales,
    creditNotes,
    purchases,
    receivablePayments,
    payablePayments,
    expenses,
    expensePayments,
    treasury,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: { id: { in: ids(['SALE', 'SALE_CANCEL']) } },
      select: { id: true, invoiceNumber: true },
    }),
    prisma.creditNote.findMany({
      where: { id: { in: ids(['CREDIT_NOTE', 'CREDIT_NOTE_CANCEL']) } },
      select: { id: true, creditNoteNumber: true, sale: { select: { invoiceNumber: true } } },
    }),
    prisma.purchase.findMany({
      where: { id: { in: ids(['PURCHASE']) } },
      select: { id: true, invoiceNumber: true },
    }),
    prisma.receivablePayment.findMany({
      where: { id: { in: ids(['RECEIVABLE_PAYMENT']) } },
      select: { id: true, treasuryDocument: { select: { documentNumber: true } } },
    }),
    prisma.payablePayment.findMany({
      where: { id: { in: ids(['PAYABLE_PAYMENT']) } },
      select: { id: true, treasuryDocument: { select: { documentNumber: true } } },
    }),
    prisma.expense.findMany({
      where: { id: { in: ids(['EXPENSE']) } },
      select: { id: true, documentNumber: true },
    }),
    prisma.expensePayment.findMany({
      where: { id: { in: ids(['EXPENSE_PAYMENT']) } },
      select: { id: true, treasuryDocument: { select: { documentNumber: true } } },
    }),
    prisma.treasuryDocument.findMany({
      where: {
        OR: [
          { cashMovementId: { in: ids(['CASH_MOVEMENT']) } },
          { bankMovementId: { in: ids(['BANK_MOVEMENT']) } },
        ],
      },
      select: { documentNumber: true, cashMovementId: true, bankMovementId: true },
    }),
  ]);

  const byId = new Map<string, JournalSourceDocumentDto>();
  for (const s of sales)
    byId.set(`SALE:${s.id}`, { number: s.invoiceNumber, href: search('/sales', s.invoiceNumber) });
  for (const n of creditNotes)
    byId.set(`CREDIT_NOTE:${n.id}`, {
      number: n.creditNoteNumber,
      href: search('/sales', n.sale.invoiceNumber),
    });
  for (const p of purchases)
    byId.set(`PURCHASE:${p.id}`, {
      number: p.invoiceNumber,
      href: search('/purchases', p.invoiceNumber),
    });
  for (const p of [...receivablePayments, ...payablePayments, ...expensePayments]) {
    if (p.treasuryDocument)
      byId.set(`PAYMENT:${p.id}`, {
        number: p.treasuryDocument.documentNumber,
        href: treasuryHref(p.treasuryDocument.documentNumber),
      });
  }
  for (const e of expenses)
    byId.set(`EXPENSE:${e.id}`, {
      number: e.documentNumber || 'Causación',
      href: e.documentNumber ? search('/expenses', e.documentNumber) : '/expenses',
    });
  for (const d of treasury) {
    const key = d.cashMovementId ? `CASH:${d.cashMovementId}` : `BANK:${d.bankMovementId}`;
    byId.set(key, { number: d.documentNumber, href: treasuryHref(d.documentNumber) });
  }

  const result = new Map<string, JournalSourceDocumentDto>();
  for (const entry of entries) {
    const source = effective(entry);
    let doc: JournalSourceDocumentDto | undefined;
    switch (source.sourceType) {
      case 'SALE':
      case 'SALE_CANCEL':
        doc = byId.get(`SALE:${source.sourceId}`);
        break;
      case 'CREDIT_NOTE':
      case 'CREDIT_NOTE_CANCEL':
        doc = byId.get(`CREDIT_NOTE:${source.sourceId}`);
        break;
      case 'PURCHASE':
        doc = byId.get(`PURCHASE:${source.sourceId}`);
        break;
      case 'DEBIT_NOTE':
        doc = { number: source.sourceId, href: '/purchases' };
        break;
      case 'RECEIVABLE_PAYMENT':
      case 'PAYABLE_PAYMENT':
      case 'EXPENSE_PAYMENT':
        doc = byId.get(`PAYMENT:${source.sourceId}`);
        break;
      case 'EXPENSE':
        doc = byId.get(`EXPENSE:${source.sourceId}`);
        break;
      case 'CASH_MOVEMENT':
        doc = byId.get(`CASH:${source.sourceId}`);
        break;
      case 'BANK_MOVEMENT':
        doc = byId.get(`BANK:${source.sourceId}`);
        break;
      case 'MANUAL_NOTE':
        doc = { number: source.sourceId, href: null };
        break;
      case 'OPENING_BALANCE':
        doc = { number: 'Saldos iniciales', href: '/accounting/setup' };
        break;
      case 'ANNUAL_CLOSING':
      case 'FISCAL_CLOSING':
        doc = { number: 'Cierre contable', href: '/accounting/periods' };
        break;
      case 'INVENTORY_ADJUSTMENT':
      case 'INVENTORY_INITIAL':
      case 'LOT_INITIAL':
      case 'METHOD_CHANGE':
        doc = { number: 'Inventario', href: '/inventory/movements' };
        break;
    }
    if (doc) result.set(entry.id, doc);
  }
  return result;
}
