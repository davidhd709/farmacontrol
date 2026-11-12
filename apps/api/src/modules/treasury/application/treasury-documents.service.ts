import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import type {
  PaginatedResponse,
  TreasuryDocumentApplicationDto,
  TreasuryDocumentDto,
  TreasuryDocumentOrigin,
  TreasuryDocumentFilters,
  TreasuryDocumentStatus,
  TreasuryDocumentType,
} from '@farmacia/contracts';
import { TreasuryNotFoundError, TreasuryValidationError, validateUuid } from '../domain/treasury-rules';

const TYPES: readonly TreasuryDocumentType[] = ['RECIBO_CAJA', 'COMPROBANTE_EGRESO'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const include = {
  bankAccount: { select: { name: true, bankName: true } },
  createdBy: { select: { username: true } },
  cancelledBy: { select: { username: true } },
  customer: { select: { name: true } },
  supplier: { select: { name: true } },
  thirdParty: { select: { name: true } },
  counterpartAccount: { select: { code: true, name: true } },
  receivablePayments: {
    select: { receivableId: true, amount: true, isReversed: true, receivable: { select: { sale: { select: { invoiceNumber: true } } } } },
  },
  payablePayments: {
    select: { payableId: true, amount: true, isReversed: true, payable: { select: { purchase: { select: { invoiceNumber: true } } } } },
  },
  expensePayments: {
    select: { expenseId: true, amount: true, isReversed: true, expense: { select: { documentNumber: true, description: true } } },
  },
} as const;
type Client = Prisma.TransactionClient | typeof prisma;
type DocumentRecord = Prisma.TreasuryDocumentGetPayload<{ include: typeof include }>;

/**
 * Consulta de recibos de caja y comprobantes de egreso. Los registrados desde Tesorería
 * guardan su tercero y las facturas que aplican (ADR-007); los emitidos por los triggers de
 * cash_movements y bank_movements (ADR-002) resuelven el tercero según el origen.
 */
@Injectable()
export class TreasuryDocumentsService {
  async list(filters: TreasuryDocumentFilters): Promise<PaginatedResponse<TreasuryDocumentDto>> {
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
    const where: Prisma.TreasuryDocumentWhereInput = {};

    if (filters.type !== undefined) {
      if (!TYPES.includes(filters.type)) {
        throw new TreasuryValidationError('Tipo de documento inválido: use RECIBO_CAJA o COMPROBANTE_EGRESO.');
      }
      where.documentType = filters.type;
    }
    if (filters.fromDate || filters.toDate) {
      for (const value of [filters.fromDate, filters.toDate]) {
        if (value !== undefined && !DATE_RE.test(value)) {
          throw new TreasuryValidationError('Las fechas deben tener formato YYYY-MM-DD.');
        }
      }
      where.documentDate = {
        ...(filters.fromDate ? { gte: new Date(`${filters.fromDate}T00:00:00Z`) } : {}),
        ...(filters.toDate ? { lte: new Date(`${filters.toDate}T00:00:00Z`) } : {}),
      };
    }
    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { concept: { contains: search, mode: 'insensitive' } },
        { referenceDocumentId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.treasuryDocument.count({ where }),
      prisma.treasuryDocument.findMany({
        where,
        include,
        orderBy: [{ documentDate: 'desc' }, { documentNumber: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const thirdParties = await this.resolveThirdParties(records);
    return {
      items: records.map((record) => this.toDto(record, thirdParties.get(record.id) ?? null)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(id: string, client: Client = prisma): Promise<TreasuryDocumentDto> {
    validateUuid(id, 'ID del documento');
    const record = await client.treasuryDocument.findUnique({ where: { id }, include });
    if (!record) throw new TreasuryNotFoundError('Documento no encontrado.');
    const thirdParties = await this.resolveThirdParties([record], client);
    return this.toDto(record, thirdParties.get(record.id) ?? null);
  }

  private toDto(record: DocumentRecord, thirdPartyName: string | null): TreasuryDocumentDto {
    return {
      id: record.id,
      documentType: record.documentType as TreasuryDocumentType,
      documentNumber: record.documentNumber,
      documentDate: record.documentDate.toISOString().slice(0, 10),
      amount: record.amount.toFixed(2),
      paymentMethod: record.paymentMethod,
      source: record.bankMovementId ? 'BANCO' : 'CAJA',
      bankAccountName: record.bankAccount
        ? `${record.bankAccount.bankName} — ${record.bankAccount.name}`
        : null,
      bankAccountId: record.bankAccountId ?? null,
      concept: record.concept,
      referenceDocumentType: record.referenceDocumentType,
      referenceDocumentId: record.referenceDocumentId,
      thirdPartyName:
        record.customer?.name ?? record.supplier?.name ?? record.thirdParty?.name ?? thirdPartyName,
      thirdPartyId: record.thirdPartyId ?? null,
      customerId: record.customerId ?? null,
      supplierId: record.supplierId ?? null,
      origin: record.origin as TreasuryDocumentOrigin,
      counterpartAccount: record.counterpartAccount
        ? `${record.counterpartAccount.code} - ${record.counterpartAccount.name}`
        : null,
      counterpartAccountId: record.counterpartAccountId ?? null,
      applications: this.applicationsOf(record),
      status: record.status as TreasuryDocumentStatus,
      cancelledAt: record.cancelledAt ? record.cancelledAt.toISOString() : null,
      cancelledByName: record.cancelledBy?.username ?? null,
      cancellationReason: record.cancellationReason,
      createdByName: record.createdBy?.username ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private applicationsOf(record: DocumentRecord): TreasuryDocumentApplicationDto[] {
    return [
      ...record.receivablePayments.map((p) => ({
        documentType: 'FACTURA_VENTA' as const,
        documentId: p.receivableId,
        documentNumber: p.receivable.sale?.invoiceNumber ?? null,
        amount: p.amount.toFixed(2),
        isReversed: p.isReversed,
      })),
      ...record.payablePayments.map((p) => ({
        documentType: 'FACTURA_COMPRA' as const,
        documentId: p.payableId,
        documentNumber: p.payable.purchase?.invoiceNumber ?? null,
        amount: p.amount.toFixed(2),
        isReversed: p.isReversed,
      })),
      ...record.expensePayments.map((p) => ({
        documentType: 'CAUSACION_GASTO' as const,
        documentId: p.expenseId,
        documentNumber: p.expense.documentNumber ?? p.expense.description,
        amount: p.amount.toFixed(2),
        isReversed: p.isReversed,
      })),
    ];
  }

  /** Tercero por origen: ventas y notas crédito (cliente), cartera, cuentas por pagar y gastos. */
  private async resolveThirdParties(
    records: DocumentRecord[],
    client: Client = prisma,
  ): Promise<Map<string, string>> {
    const idsOf = (...types: string[]) => [
      ...new Set(
        records
          .filter((r) => r.referenceDocumentType && types.includes(r.referenceDocumentType) && r.referenceDocumentId)
          .map((r) => r.referenceDocumentId!),
      ),
    ];
    const uuids = (values: string[]) => values.filter((v) => /^[0-9a-f-]{36}$/i.test(v));

    const [sales, creditNotes, receivables, payables, expenses, expensePayments] = await Promise.all([
      client.sale.findMany({
        where: { invoiceNumber: { in: idsOf('SALE', 'SALE_CANCEL') } },
        select: { invoiceNumber: true, customer: { select: { name: true } } },
      }),
      client.creditNote.findMany({
        where: { creditNoteNumber: { in: idsOf('CREDIT_NOTE') } },
        select: { creditNoteNumber: true, sale: { select: { customer: { select: { name: true } } } } },
      }),
      client.receivable.findMany({
        where: { id: { in: uuids(idsOf('RECEIVABLE', 'RECEIVABLE_PAYMENT_REVERSAL')) } },
        select: { id: true, customer: { select: { name: true } } },
      }),
      client.payable.findMany({
        where: { id: { in: uuids(idsOf('PAYABLE', 'PAYABLE_PAYMENT_REVERSAL')) } },
        select: { id: true, supplier: { select: { name: true } } },
      }),
      client.expense.findMany({
        where: { id: { in: uuids(idsOf('EXPENSE', 'EXPENSE_CANCEL')) } },
        select: { id: true, beneficiary: true },
      }),
      client.expensePayment.findMany({
        where: { id: { in: uuids(idsOf('EXPENSE_PAYMENT', 'EXPENSE_PAYMENT_REVERSAL')) } },
        select: { id: true, expense: { select: { beneficiary: true } } },
      }),
    ]);

    const byReference = new Map<string, string>();
    for (const s of sales) if (s.customer?.name) byReference.set(s.invoiceNumber, s.customer.name);
    for (const n of creditNotes) if (n.sale?.customer?.name) byReference.set(n.creditNoteNumber, n.sale.customer.name);
    for (const r of receivables) if (r.customer?.name) byReference.set(r.id, r.customer.name);
    for (const p of payables) if (p.supplier?.name) byReference.set(p.id, p.supplier.name);
    for (const e of expenses) byReference.set(e.id, e.beneficiary);
    for (const p of expensePayments) if (p.expense?.beneficiary) byReference.set(p.id, p.expense.beneficiary);

    const result = new Map<string, string>();
    for (const record of records) {
      const name = record.referenceDocumentId ? byReference.get(record.referenceDocumentId) : undefined;
      if (name) result.set(record.id, name);
    }
    return result;
  }
}
