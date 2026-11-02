import { BadRequestException, Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import type {
  PayableStatementDto,
  PayableStatementFilters,
  PayableStatementItemDto,
} from '@farmacia/contracts';
import { businessToday, calendarDate } from '../../../common/utils/business-date';
import { agingBreakdown, agingBucketOf, agingStartDate, daysOverdue } from '../../../common/utils/aging';
import { accountingPolicyAt } from '../../company/application/accounting-policy.reader';

import { parseMoneyToCents } from '../../treasury/domain/treasury-rules';

const isoDay = (value: Date) => value.toISOString().slice(0, 10);

/**
 * Estado de cuenta de cuentas por pagar: facturas de compra (payables) y causaciones de gasto
 * del proveedor, con su saldo y su edad. Lo consultan la pantalla de cuentas por pagar y el
 * comprobante de egreso para elegir qué facturas pagar. Solo lee los gastos.
 */
@Injectable()
export class PayablesStatementService {
  async getStatement(filters: PayableStatementFilters): Promise<PayableStatementDto> {
    if (!filters.supplierId && !filters.fromDate && !filters.toDate) {
      throw new BadRequestException(
        'Consulte cuentas por pagar por proveedor o por rango de fechas.',
      );
    }
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      throw new BadRequestException('La fecha desde no puede ser posterior a la fecha hasta.');
    }
    const range =
      filters.fromDate || filters.toDate
        ? {
            ...(filters.fromDate ? { gte: calendarDate(filters.fromDate) } : {}),
            ...(filters.toDate ? { lte: calendarDate(filters.toDate) } : {}),
          }
        : undefined;
    const pendingOnly = !filters.includePaid;

    const [payables, expenses] = await Promise.all([
      prisma.payable.findMany({
        where: {
          status: { not: 'ANULADA' },
          ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
          ...(pendingOnly ? { balance: { gt: 0 } } : {}),
          ...(range ? { purchase: { purchaseDate: range } } : {}),
        },
        include: {
          supplier: { select: { name: true } },
          purchase: { select: { invoiceNumber: true, purchaseDate: true } },
        },
      }),
      prisma.expense.findMany({
        where: {
          status: { not: 'ANULADO' },
          ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
          ...(pendingOnly ? { balance: { gt: 0 } } : {}),
          ...(range ? { expenseDate: range } : {}),
        },
        include: { supplier: { select: { name: true } } },
      }),
    ]);

    const today = calendarDate(businessToday());
    const { agingBaseDate } = await accountingPolicyAt(prisma, businessToday());
    const cents = (value: Prisma.Decimal) => parseMoneyToCents(value.toFixed(2), 'Saldo');
    const items: PayableStatementItemDto[] = [
      ...payables.map((p) => {
        const days = daysOverdue(
          agingStartDate(agingBaseDate, {
            dueDate: p.dueDate,
            issuedAt: p.purchase?.purchaseDate ?? p.createdAt,
          }),
          today,
        );
        return {
          documentType: 'FACTURA_COMPRA' as const,
          documentId: p.id,
          documentNumber: p.purchase?.invoiceNumber ?? null,
          supplierId: p.supplierId,
          supplierName: p.supplier?.name ?? null,
          description: 'Factura de compra',
          documentDate: isoDay(p.purchase?.purchaseDate ?? p.createdAt),
          dueDate: isoDay(p.dueDate),
          totalAmount: p.totalAmount.toFixed(2),
          amountPaid: p.amountPaid.toFixed(2),
          balance: p.balance.toFixed(2),
          status: p.status,
          daysOverdue: days,
          agingBucket: agingBucketOf(days),
        };
      }),
      ...expenses.map((e) => {
        // Una causación sin vencimiento cuenta desde el día en que se causa
        const days = daysOverdue(
          agingStartDate(agingBaseDate, { dueDate: e.dueDate, issuedAt: e.expenseDate }),
          today,
        );
        return {
          documentType: 'CAUSACION_GASTO' as const,
          documentId: e.id,
          documentNumber: e.documentNumber ?? null,
          supplierId: e.supplierId,
          supplierName: e.supplier?.name ?? e.beneficiary,
          description: e.description,
          documentDate: isoDay(e.expenseDate),
          dueDate: e.dueDate ? isoDay(e.dueDate) : null,
          totalAmount: e.amount.toFixed(2),
          amountPaid: e.amountPaid.toFixed(2),
          balance: e.balance.toFixed(2),
          status: e.status,
          daysOverdue: days,
          agingBucket: agingBucketOf(days),
        };
      }),
    ].sort(
      (a, b) =>
        (a.dueDate ?? a.documentDate).localeCompare(b.dueDate ?? b.documentDate) ||
        a.documentDate.localeCompare(b.documentDate),
    );

    return {
      items,
      aging: agingBreakdown(
        items.map((item) => ({
          balanceCents: cents(new Prisma.Decimal(item.balance)),
          bucket: item.agingBucket,
        })),
      ),
    };
  }
}
