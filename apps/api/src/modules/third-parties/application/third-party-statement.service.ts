import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import type { ReceivableStatementItemDto, ThirdPartyStatementDto } from '@farmacia/contracts';
import { businessToday, calendarDate } from '../../../common/utils/business-date';
import { agingBreakdown, agingBucketOf, daysOverdue } from '../../../common/utils/aging';
import { PayablesStatementService } from '../../payables/application/payables-statement.service';
import { parseMoneyToCents, centsToMoneyString } from '../../treasury/domain/treasury-rules';

/**
 * Estado de cuenta automático de un tercero (contabilidad): su cartera pendiente si es cliente
 * y sus cuentas por pagar pendientes si es proveedor, con edades y saldo neto.
 */
@Injectable()
export class ThirdPartyStatementService {
  constructor(private readonly payablesStatement: PayablesStatementService) {}

  async getStatement(thirdPartyId: string): Promise<ThirdPartyStatementDto> {
    const party = await prisma.thirdParty.findUnique({ where: { id: thirdPartyId } });
    if (!party) throw new NotFoundException('Tercero no encontrado.');

    const today = calendarDate(businessToday());
    const cents = (value: Prisma.Decimal) => parseMoneyToCents(value.toFixed(2), 'Saldo');

    let receivables: ThirdPartyStatementDto['receivables'] = null;
    if (party.customerId) {
      const rows = await prisma.receivable.findMany({
        where: { customerId: party.customerId, status: 'PENDIENTE', balance: { gt: 0 } },
        include: { sale: { select: { invoiceNumber: true, createdAt: true } } },
        orderBy: { dueDate: 'asc' },
      });
      const items: ReceivableStatementItemDto[] = rows.map((r) => {
        const days = daysOverdue(r.dueDate, today);
        return {
          receivableId: r.id,
          invoiceNumber: r.sale?.invoiceNumber ?? null,
          documentDate: (r.sale?.createdAt ?? r.createdAt).toISOString().slice(0, 10),
          dueDate: r.dueDate.toISOString().slice(0, 10),
          totalAmount: r.totalAmount.toFixed(2),
          amountPaid: r.amountPaid.toFixed(2),
          balance: r.balance.toFixed(2),
          daysOverdue: days,
          agingBucket: agingBucketOf(days),
        };
      });
      receivables = {
        items,
        aging: agingBreakdown(
          rows.map((r, i) => ({ balanceCents: cents(r.balance), bucket: items[i].agingBucket })),
        ),
      };
    }

    const payables = party.supplierId
      ? await this.payablesStatement.getStatement({ supplierId: party.supplierId })
      : null;

    const owedToUs = receivables ? parseMoneyToCents(receivables.aging.totalPending, 'Cartera') : 0n;
    const weOwe = payables ? parseMoneyToCents(payables.aging.totalPending, 'Cuentas por pagar') : 0n;
    const net = owedToUs - weOwe;
    return {
      thirdPartyId: party.id,
      name: party.name,
      documentType: party.documentType,
      documentNumber: party.documentNumber,
      isCustomer: Boolean(party.customerId),
      isSupplier: Boolean(party.supplierId),
      receivables,
      payables,
      totalOwedToUs: centsToMoneyString(owedToUs),
      totalWeOwe: centsToMoneyString(weOwe),
      netBalance: net < 0n ? `-${centsToMoneyString(-net)}` : centsToMoneyString(net),
    };
  }
}
