import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import ExcelJS from 'exceljs';
import {
  TREASURY_DOCUMENT_STATUSES,
  TREASURY_DOCUMENTS_EXPORT_LIMIT,
  type PaginatedResponse,
  type TreasuryDocumentApplicationDto,
  type TreasuryDocumentDto,
  type TreasuryDocumentOrigin,
  type TreasuryDocumentFilters,
  type TreasuryDocumentStatus,
  type TreasuryDocumentType,
  type TreasurySourceDocumentDto,
} from '@farmacia/contracts';
import { TreasuryNotFoundError, TreasuryValidationError, validateUuid } from '../domain/treasury-rules';

const TYPES: readonly TreasuryDocumentType[] = ['RECIBO_CAJA', 'COMPROBANTE_EGRESO'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ORIGIN_LABELS: Record<TreasuryDocumentOrigin, string> = {
  AUTOMATICO: 'Automático',
  MANUAL: 'Manual',
  CARTERA: 'Cartera',
  PROVEEDOR: 'Proveedor',
};

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
interface ResolvedReference {
  thirdPartyName: string | null;
  source: TreasurySourceDocumentDto | null;
}

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
    const where = this.whereOf(filters);

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
    const references = await this.resolveReferences(records);
    return {
      items: records.map((record) => this.toDto(record, references.get(record.id) ?? null)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Filtros comunes del listado y de la exportación */
  private whereOf(filters: TreasuryDocumentFilters): Prisma.TreasuryDocumentWhereInput {
    const where: Prisma.TreasuryDocumentWhereInput = {};

    if (filters.type !== undefined) {
      if (!TYPES.includes(filters.type)) {
        throw new TreasuryValidationError('Tipo de documento inválido: use RECIBO_CAJA o COMPROBANTE_EGRESO.');
      }
      where.documentType = filters.type;
    }
    if (filters.status !== undefined) {
      if (!TREASURY_DOCUMENT_STATUSES.includes(filters.status)) {
        throw new TreasuryValidationError('Estado inválido: use VIGENTE o ANULADO.');
      }
      where.status = filters.status;
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
    return where;
  }

  /**
   * Libro de Excel con los documentos que cumplen los filtros, en el mismo orden del listado.
   * Los valores salen del decimal de la base con dos decimales; la celda numérica permite sumar.
   */
  async exportToExcel(filters: TreasuryDocumentFilters): Promise<Buffer> {
    const where = this.whereOf(filters);
    const total = await prisma.treasuryDocument.count({ where });
    if (total > TREASURY_DOCUMENTS_EXPORT_LIMIT) {
      throw new TreasuryValidationError(
        `La consulta tiene ${total} documentos y la exportación admite hasta ${TREASURY_DOCUMENTS_EXPORT_LIMIT}. Acote las fechas o los filtros.`,
      );
    }
    const records = await prisma.treasuryDocument.findMany({
      where,
      include,
      orderBy: [{ documentDate: 'desc' }, { documentNumber: 'desc' }],
    });
    const references = await this.resolveReferences(records);
    const documents = records.map((record) => this.toDto(record, references.get(record.id) ?? null));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FarmaControl';
    const sheet = workbook.addWorksheet('Recibos y egresos');
    sheet.columns = [
      { header: 'Número', key: 'number', width: 14 },
      { header: 'Tipo', key: 'type', width: 22 },
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Estado', key: 'status', width: 10 },
      { header: 'Origen', key: 'origin', width: 12 },
      { header: 'Tercero', key: 'thirdParty', width: 32 },
      { header: 'Concepto', key: 'concept', width: 40 },
      { header: 'Medio de pago', key: 'method', width: 15 },
      { header: 'Auxiliar', key: 'source', width: 30 },
      { header: 'Contrapartida', key: 'counterpart', width: 32 },
      { header: 'Valor', key: 'amount', width: 16, style: { numFmt: '#,##0.00' } },
      { header: 'Motivo de anulación', key: 'reason', width: 40 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const doc of documents) {
      sheet.addRow({
        number: doc.documentNumber,
        type: doc.documentType === 'RECIBO_CAJA' ? 'Recibo de caja' : 'Comprobante de egreso',
        date: doc.documentDate,
        status: doc.status === 'ANULADO' ? 'Anulado' : 'Vigente',
        origin: ORIGIN_LABELS[doc.origin],
        thirdParty: doc.thirdPartyName ?? '',
        concept: doc.concept,
        method: doc.paymentMethod,
        source: doc.source === 'BANCO' ? (doc.bankAccountName ?? 'Banco') : 'Caja',
        counterpart: doc.counterpartAccount ?? '',
        // Frontera de serialización: Excel guarda números en coma flotante; el valor viene
        // redondeado a centavos desde el decimal de la base y solo se muestra o se suma allí
        amount: Number(doc.amount),
        reason: doc.cancellationReason ?? '',
      });
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async getById(id: string, client: Client = prisma): Promise<TreasuryDocumentDto> {
    validateUuid(id, 'ID del documento');
    const record = await client.treasuryDocument.findUnique({ where: { id }, include });
    if (!record) throw new TreasuryNotFoundError('Documento no encontrado.');
    const references = await this.resolveReferences([record], client);
    return this.toDto(record, references.get(record.id) ?? null);
  }

  private toDto(record: DocumentRecord, reference: ResolvedReference | null): TreasuryDocumentDto {
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
        record.customer?.name ??
        record.supplier?.name ??
        record.thirdParty?.name ??
        reference?.thirdPartyName ??
        null,
      thirdPartyId: record.thirdPartyId ?? null,
      customerId: record.customerId ?? null,
      supplierId: record.supplierId ?? null,
      origin: record.origin as TreasuryDocumentOrigin,
      sourceDocument: reference?.source ?? null,
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

  /**
   * Tercero y documento de origen de cada registro, en una consulta por tipo de referencia.
   * Las ventas y notas crédito se referencian por su número; cartera, cuentas por pagar y gastos
   * por su id; las reversiones de abonos y pagos, por el id del abono o pago revertido.
   */
  private async resolveReferences(
    records: DocumentRecord[],
    client: Client = prisma,
  ): Promise<Map<string, ResolvedReference>> {
    const idsOf = (...types: string[]) => [
      ...new Set(
        records
          .filter((r) => r.referenceDocumentType && types.includes(r.referenceDocumentType) && r.referenceDocumentId)
          .map((r) => r.referenceDocumentId!),
      ),
    ];
    const uuids = (values: string[]) => values.filter((v) => /^[0-9a-f-]{36}$/i.test(v));
    const receivableSelect = { id: true, customer: { select: { name: true } }, sale: { select: { invoiceNumber: true } } } as const;
    const payableSelect = { id: true, supplier: { select: { name: true } }, purchase: { select: { invoiceNumber: true } } } as const;
    const expenseSelect = { id: true, beneficiary: true, documentNumber: true } as const;

    const [sales, creditNotes, receivables, receivablePayments, payables, payablePayments, expenses, expensePayments] =
      await Promise.all([
        client.sale.findMany({
          where: { invoiceNumber: { in: idsOf('SALE', 'SALE_CANCEL') } },
          select: { invoiceNumber: true, customer: { select: { name: true } } },
        }),
        client.creditNote.findMany({
          where: { creditNoteNumber: { in: idsOf('CREDIT_NOTE', 'CREDIT_NOTE_CANCEL') } },
          select: { id: true, creditNoteNumber: true, sale: { select: { customer: { select: { name: true } } } } },
        }),
        client.receivable.findMany({
          where: { id: { in: uuids(idsOf('RECEIVABLE')) } },
          select: receivableSelect,
        }),
        client.receivablePayment.findMany({
          where: { id: { in: uuids(idsOf('RECEIVABLE_PAYMENT', 'RECEIVABLE_PAYMENT_REVERSAL')) } },
          select: { id: true, receivable: { select: receivableSelect } },
        }),
        client.payable.findMany({
          where: { id: { in: uuids(idsOf('PAYABLE')) } },
          select: payableSelect,
        }),
        client.payablePayment.findMany({
          where: { id: { in: uuids(idsOf('PAYABLE_PAYMENT', 'PAYABLE_PAYMENT_REVERSAL')) } },
          select: { id: true, payable: { select: payableSelect } },
        }),
        client.expense.findMany({
          where: { id: { in: uuids(idsOf('EXPENSE', 'EXPENSE_CANCEL')) } },
          select: expenseSelect,
        }),
        client.expensePayment.findMany({
          where: { id: { in: uuids(idsOf('EXPENSE_PAYMENT', 'EXPENSE_PAYMENT_REVERSAL')) } },
          select: { id: true, expense: { select: expenseSelect } },
        }),
      ]);

    type Receivable = (typeof receivables)[number];
    type Payable = (typeof payables)[number];
    type Expense = (typeof expenses)[number];
    const ofReceivable = (r: Receivable): ResolvedReference => ({
      thirdPartyName: r.customer?.name ?? null,
      source: { kind: 'CUENTA_POR_COBRAR', id: r.id, number: r.sale?.invoiceNumber ?? null },
    });
    const ofPayable = (p: Payable): ResolvedReference => ({
      thirdPartyName: p.supplier?.name ?? null,
      source: { kind: 'CUENTA_POR_PAGAR', id: p.id, number: p.purchase?.invoiceNumber ?? null },
    });
    const ofExpense = (e: Expense): ResolvedReference => ({
      thirdPartyName: e.beneficiary,
      source: { kind: 'GASTO', id: e.id, number: e.documentNumber },
    });

    const byReference = new Map<string, ResolvedReference>();
    for (const s of sales) byReference.set(s.invoiceNumber, { thirdPartyName: s.customer?.name ?? null, source: null });
    for (const n of creditNotes) {
      byReference.set(n.creditNoteNumber, {
        thirdPartyName: n.sale?.customer?.name ?? null,
        source: { kind: 'NOTA_CREDITO', id: n.id, number: n.creditNoteNumber },
      });
    }
    for (const r of receivables) byReference.set(r.id, ofReceivable(r));
    for (const p of receivablePayments) byReference.set(p.id, ofReceivable(p.receivable));
    for (const p of payables) byReference.set(p.id, ofPayable(p));
    for (const p of payablePayments) byReference.set(p.id, ofPayable(p.payable));
    for (const e of expenses) byReference.set(e.id, ofExpense(e));
    for (const p of expensePayments) byReference.set(p.id, ofExpense(p.expense));

    const result = new Map<string, ResolvedReference>();
    for (const record of records) {
      const resolved = record.referenceDocumentId ? byReference.get(record.referenceDocumentId) : undefined;
      if (resolved) result.set(record.id, resolved);
    }
    return result;
  }
}
