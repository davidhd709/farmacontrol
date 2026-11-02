import { BadRequestException, Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import type {
  AccountingAuditDto,
  AccountingAuditFilters,
  AccountingAuditItemDto,
} from '@farmacia/contracts';

const MAX_ROWS = 500;

interface EntryRow {
  id: string;
  entry_date: Date;
  source_type: string;
  source_id: string;
  description: string;
  total_debit: Prisma.Decimal;
  total_credit: Prisma.Decimal;
  line_count: bigint;
  reversal_id: string | null;
  reversal_date: Date | null;
  reversal_reason: string | null;
}

const day = (value: Date) => value.toISOString().slice(0, 10);

/**
 * Auditoría contable: documentos descuadrados (asientos con débitos distintos de créditos o sin
 * contrapartida, y recibos o egresos cuyo valor no coincide con lo aplicado a facturas) y
 * documentos anulados (asientos reversados), con filtros por fecha y tipo de documento.
 */
@Injectable()
export class AccountingAuditService {
  async audit(filters: AccountingAuditFilters): Promise<AccountingAuditDto> {
    if (filters.view !== 'DESCUADRADOS' && filters.view !== 'ANULADOS') {
      throw new BadRequestException('La vista debe ser DESCUADRADOS o ANULADOS.');
    }
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      throw new BadRequestException('La fecha desde no puede ser posterior a la fecha hasta.');
    }
    const documentTypes = (
      await prisma.$queryRaw<Array<{ source_type: string }>>`
        SELECT DISTINCT source_type FROM journal_entries ORDER BY source_type
      `
    ).map((r) => r.source_type);

    const items =
      filters.view === 'DESCUADRADOS' ? await this.unbalanced(filters) : await this.cancelled(filters);
    return { view: filters.view, items, documentTypes };
  }

  private dateRange(column: Prisma.Sql, filters: AccountingAuditFilters) {
    return Prisma.sql`
      ${filters.fromDate ? Prisma.sql`AND ${column} >= ${filters.fromDate}::date` : Prisma.empty}
      ${filters.toDate ? Prisma.sql`AND ${column} <= ${filters.toDate}::date` : Prisma.empty}
    `;
  }

  private async unbalanced(filters: AccountingAuditFilters): Promise<AccountingAuditItemDto[]> {
    const entries =
      filters.documentType === 'TREASURY_DOCUMENT'
        ? []
        : await prisma.$queryRaw<EntryRow[]>`
            SELECT je.id, je.entry_date, je.source_type, je.source_id, je.description,
                   COALESCE(SUM(l.debit), 0) AS total_debit, COALESCE(SUM(l.credit), 0) AS total_credit,
                   COUNT(l.id) AS line_count, NULL::uuid AS reversal_id, NULL::date AS reversal_date,
                   NULL::varchar AS reversal_reason
            FROM journal_entries je
            LEFT JOIN journal_entry_lines l ON l.journal_entry_id = je.id
            WHERE TRUE
              ${filters.documentType ? Prisma.sql`AND je.source_type = ${filters.documentType}` : Prisma.empty}
              ${this.dateRange(Prisma.sql`je.entry_date`, filters)}
            GROUP BY je.id
            HAVING COALESCE(SUM(l.debit), 0) <> COALESCE(SUM(l.credit), 0) OR COUNT(l.id) < 2
            ORDER BY je.entry_date DESC, je.id
            LIMIT ${MAX_ROWS}
          `;

    // Recibos y egresos registrados como documento: su valor debe ser lo que aplican a facturas
    const documents =
      filters.documentType && filters.documentType !== 'TREASURY_DOCUMENT'
        ? []
        : await prisma.$queryRaw<
            Array<{
              id: string;
              document_number: string;
              document_date: Date;
              concept: string;
              amount: Prisma.Decimal;
              applied: Prisma.Decimal;
            }>
          >`
            SELECT d.id, d.document_number, d.document_date, d.concept, d.amount,
                   COALESCE(rp.total, 0) + COALESCE(pp.total, 0) + COALESCE(ep.total, 0) AS applied
            FROM treasury_documents d
            LEFT JOIN (SELECT treasury_document_id, SUM(amount) AS total FROM receivable_payments GROUP BY 1) rp
              ON rp.treasury_document_id = d.id
            LEFT JOIN (SELECT treasury_document_id, SUM(amount) AS total FROM payable_payments GROUP BY 1) pp
              ON pp.treasury_document_id = d.id
            LEFT JOIN (SELECT treasury_document_id, SUM(amount) AS total FROM expense_payments GROUP BY 1) ep
              ON ep.treasury_document_id = d.id
            WHERE d.origin IN ('CARTERA', 'PROVEEDOR')
              ${this.dateRange(Prisma.sql`d.document_date`, filters)}
              AND d.amount <> COALESCE(rp.total, 0) + COALESCE(pp.total, 0) + COALESCE(ep.total, 0)
            ORDER BY d.document_date DESC
            LIMIT ${MAX_ROWS}
          `;

    return [
      ...entries.map((row) => this.toItem(row)),
      ...documents.map((d) => ({
        journalEntryId: null,
        date: day(d.document_date),
        documentType: 'TREASURY_DOCUMENT',
        documentId: d.id,
        documentNumber: d.document_number,
        description: d.concept,
        totalDebit: d.amount.toFixed(2),
        totalCredit: new Prisma.Decimal(d.applied).toFixed(2),
        difference: d.amount.minus(d.applied).toFixed(2),
        lineCount: 0,
        reversalEntryId: null,
        reversalDate: null,
        reversalReason: null,
      })),
    ];
  }

  /** Un documento anulado o revertido deja su asiento original reversado. */
  private async cancelled(filters: AccountingAuditFilters): Promise<AccountingAuditItemDto[]> {
    const rows = await prisma.$queryRaw<EntryRow[]>`
      SELECT je.id, je.entry_date, je.source_type, je.source_id, je.description,
             COALESCE(SUM(l.debit), 0) AS total_debit, COALESCE(SUM(l.credit), 0) AS total_credit,
             COUNT(l.id) AS line_count, rev.id AS reversal_id, rev.entry_date AS reversal_date,
             rev.reversal_reason
      FROM journal_entries je
      JOIN journal_entries rev ON rev.reversal_of_id = je.id
      LEFT JOIN journal_entry_lines l ON l.journal_entry_id = je.id
      WHERE TRUE
        ${filters.documentType ? Prisma.sql`AND je.source_type = ${filters.documentType}` : Prisma.empty}
        ${this.dateRange(Prisma.sql`rev.entry_date`, filters)}
      GROUP BY je.id, rev.id
      ORDER BY rev.entry_date DESC, je.id
      LIMIT ${MAX_ROWS}
    `;
    return rows.map((row) => this.toItem(row));
  }

  private toItem(row: EntryRow): AccountingAuditItemDto {
    const debit = new Prisma.Decimal(row.total_debit);
    const credit = new Prisma.Decimal(row.total_credit);
    return {
      journalEntryId: row.id,
      date: day(row.entry_date),
      documentType: row.source_type,
      documentId: row.source_id,
      documentNumber: null,
      description: row.description,
      totalDebit: debit.toFixed(2),
      totalCredit: credit.toFixed(2),
      difference: debit.minus(credit).toFixed(2),
      lineCount: Number(row.line_count),
      reversalEntryId: row.reversal_id,
      reversalDate: row.reversal_date ? day(row.reversal_date) : null,
      reversalReason: row.reversal_reason,
    };
  }
}
