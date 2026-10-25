import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, prisma } from '@farmacia/database';
import type {
  ExogenousDraftDto,
  IcaDraftDto,
  LineTaxSnapshot,
  VatDraftDto,
  WithholdingDraftDto,
} from '@farmacia/contracts';
import { businessDayEnd, businessDayStart } from '../../../common/utils/business-date';
import { companyTaxProfileAt } from './tax-context.reader';

const ZERO = new Prisma.Decimal(0);
const money = (value: Prisma.Decimal) => value.toFixed(2);

function range(from: unknown, to: unknown): { from: string; to: string } {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (
    typeof from !== 'string' ||
    typeof to !== 'string' ||
    !re.test(from) ||
    !re.test(to) ||
    from > to
  ) {
    throw new BadRequestException(
      'Indique el período con from y to (YYYY-MM-DD), con from no posterior a to.',
    );
  }
  return { from, to };
}

/** Acumulador de base y valor por clave. */
class Buckets {
  private readonly map = new Map<string, { base: Prisma.Decimal; amount: Prisma.Decimal }>();
  add(key: string, base: Prisma.Decimal.Value, amount: Prisma.Decimal.Value) {
    const current = this.map.get(key) ?? { base: ZERO, amount: ZERO };
    this.map.set(key, { base: current.base.plus(base), amount: current.amount.plus(amount) });
  }
  entries() {
    return [...this.map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }
}

/**
 * Borradores tributarios (ADR-006, F8) desde las instantáneas del motor (F6). Son apoyo para
 * la contadora: no reemplazan el diligenciamiento oficial ante la DIAN ni la revisión del asesor.
 */
@Injectable()
export class TaxReportsService {
  /** Borrador del formulario 300 (IVA) del período. */
  async vat(rawFrom: unknown, rawTo: unknown): Promise<VatDraftDto> {
    const { from, to } = range(rawFrom, rawTo);
    const start = businessDayStart(from);
    const end = businessDayEnd(to);
    const saleLines = await prisma.saleLine.findMany({
      where: { sale: { status: 'COMPLETED', createdAt: { gte: start, lte: end } } },
      select: {
        subtotal: true,
        taxRate: true,
        taxAmount: true,
        incAmount: true,
        taxSnapshot: true,
      },
    });
    const sales = new Buckets();
    let incBase = ZERO;
    let incAmount = ZERO;
    for (const line of saleLines) {
      const snapshot = line.taxSnapshot as LineTaxSnapshot | null;
      const iva = snapshot?.items.find((i) => i.taxType === 'IVA');
      // Sin instantánea: venta anterior al motor o de una empresa no responsable de IVA
      const treatment = iva?.treatment ?? (snapshot ? 'NO_RESPONSABLE' : 'SIN_MOTOR_TRIBUTARIO');
      sales.add(
        `${treatment}|${new Prisma.Decimal(line.taxRate).toFixed(2)}`,
        line.subtotal,
        line.taxAmount,
      );
      if (new Prisma.Decimal(line.incAmount).gt(0)) {
        incBase = incBase.plus(line.subtotal);
        incAmount = incAmount.plus(line.incAmount);
      }
    }
    const creditLines = await prisma.creditNoteLine.aggregate({
      where: { creditNote: { createdAt: { gte: start, lte: end } } },
      _sum: { subtotal: true, taxAmount: true, incAmount: true },
    });
    const purchaseLines = await prisma.purchaseLine.findMany({
      where: {
        purchase: {
          purchaseDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
        },
      },
      select: { subtotal: true, vatRate: true, vatAmount: true },
    });
    const purchases = new Buckets();
    for (const line of purchaseLines) {
      if (new Prisma.Decimal(line.vatAmount).gt(0)) {
        purchases.add(new Prisma.Decimal(line.vatRate).toFixed(2), line.subtotal, line.vatAmount);
      }
    }
    const debitLines = await prisma.debitNoteLine.aggregate({
      where: { debitNote: { createdAt: { gte: start, lte: end } }, taxAmount: { gt: 0 } },
      _sum: { subtotal: true, taxAmount: true },
    });
    // El IVA descontable solo aplica a una empresa responsable (F6)
    const profile = await companyTaxProfileAt(prisma, to);
    const responsible = profile?.responsibilities.includes('48') ?? false;

    const salesRows = sales.entries().map(([key, v]) => {
      const [treatment, ratePct] = key.split('|');
      return { treatment, ratePct, base: money(v.base), vat: money(v.amount) };
    });
    const generated = saleLines
      .reduce((sum, l) => sum.plus(l.taxAmount), ZERO)
      .minus(creditLines._sum.taxAmount ?? ZERO);
    const deductible = responsible
      ? purchaseLines
          .reduce((sum, l) => sum.plus(l.vatAmount), ZERO)
          .minus(debitLines._sum.taxAmount ?? ZERO)
      : ZERO;
    return {
      from,
      to,
      draft: true,
      sales: salesRows,
      salesReturns: {
        base: money(creditLines._sum.subtotal ?? ZERO),
        vat: money(creditLines._sum.taxAmount ?? ZERO),
      },
      inc: {
        base: money(incBase),
        amount: money(incAmount),
        returns: money(creditLines._sum.incAmount ?? ZERO),
      },
      purchases: purchases
        .entries()
        .map(([ratePct, v]) => ({ ratePct, base: money(v.base), vat: money(v.amount) })),
      purchaseReturns: {
        base: money(debitLines._sum.subtotal ?? ZERO),
        vat: money(debitLines._sum.taxAmount ?? ZERO),
      },
      vatGenerated: money(generated),
      vatDeductible: money(deductible),
      balance: money(generated.minus(deductible)),
    };
  }

  /** Borrador del formulario 350 (retenciones practicadas) del período. */
  async withholdings(rawFrom: unknown, rawTo: unknown): Promise<WithholdingDraftDto> {
    const { from, to } = range(rawFrom, rawTo);
    const purchases = await prisma.purchase.findMany({
      where: {
        purchaseDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      },
      select: { taxSnapshot: true },
    });
    const concepts = new Buckets();
    for (const purchase of purchases) {
      const items = (purchase.taxSnapshot ?? []) as Array<{
        taxType: string;
        ruleCode: string | null;
        base: string;
        amount: string;
      }>;
      for (const it of items)
        concepts.add(`${it.taxType}|${it.ruleCode ?? ''}`, it.base, it.amount);
    }
    const reversed = await prisma.debitNote.aggregate({
      where: { createdAt: { gte: businessDayStart(from), lte: businessDayEnd(to) } },
      _sum: { withholdingIncome: true, withholdingVat: true, withholdingIca: true },
    });
    const rows = concepts.entries().map(([key, v]) => {
      const [taxType, ruleCode] = key.split('|');
      return { taxType, ruleCode: ruleCode || null, base: money(v.base), amount: money(v.amount) };
    });
    const sumType = (type: string) =>
      rows.filter((r) => r.taxType === type).reduce((sum, r) => sum.plus(r.amount), ZERO);
    const income = sumType('RETEFUENTE').minus(reversed._sum.withholdingIncome ?? ZERO);
    const vat = sumType('RETEIVA').minus(reversed._sum.withholdingVat ?? ZERO);
    const ica = sumType('RETEICA').minus(reversed._sum.withholdingIca ?? ZERO);
    return {
      from,
      to,
      draft: true,
      concepts: rows,
      reversed: {
        income: money(reversed._sum.withholdingIncome ?? ZERO),
        vat: money(reversed._sum.withholdingVat ?? ZERO),
        ica: money(reversed._sum.withholdingIca ?? ZERO),
      },
      totals: {
        income: money(income),
        vat: money(vat),
        ica: money(ica),
        total: money(income.plus(vat).plus(ica)),
      },
    };
  }

  /** Borrador de ICA: ingresos netos del período por la tarifa de la empresa. */
  async ica(rawFrom: unknown, rawTo: unknown): Promise<IcaDraftDto> {
    const { from, to } = range(rawFrom, rawTo);
    const start = businessDayStart(from);
    const end = businessDayEnd(to);
    const sales = await prisma.sale.aggregate({
      where: { status: 'COMPLETED', createdAt: { gte: start, lte: end } },
      _sum: { subtotal: true },
    });
    const returns = await prisma.creditNote.aggregate({
      where: { createdAt: { gte: start, lte: end } },
      _sum: { subtotal: true },
    });
    const withheld = await this.withholdings(from, to);
    const profile = await companyTaxProfileAt(prisma, to);
    const gross = sales._sum.subtotal ?? ZERO;
    const returned = returns._sum.subtotal ?? ZERO;
    const net = gross.minus(returned);
    const rate = profile?.icaRatePerMil ?? null;
    return {
      from,
      to,
      draft: true,
      grossIncome: money(gross),
      returns: money(returned),
      netIncome: money(net),
      activity: profile?.icaActivity ?? null,
      ratePerMil: rate ? rate.toFixed(3) : null,
      tax: money(rate ? net.mul(rate).div(1000).toDecimalPlaces(2) : ZERO),
      withheldIca: withheld.totals.ica,
    };
  }

  /** Borrador de información exógena del año: formatos 1001 (pagos) y 1007 (ingresos). */
  async exogenous(rawYear: unknown): Promise<ExogenousDraftDto> {
    const year = Number(rawYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Indique el año gravable (year).');
    }
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const purchases = await prisma.purchase.findMany({
      where: {
        purchaseDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      },
      select: {
        totalAmount: true,
        subtotal: true,
        vatTotal: true,
        withholdingIncome: true,
        withholdingVat: true,
        supplier: { select: { taxId: true, name: true } },
        debitNotes: {
          select: { subtotal: true, taxTotal: true, withholdingIncome: true, withholdingVat: true },
        },
      },
    });
    const bySupplier = new Map<
      string,
      ExogenousDraftDto['payments'][number] & { _: Prisma.Decimal[] }
    >();
    for (const p of purchases) {
      const key = p.supplier.taxId;
      const current = bySupplier.get(key) ?? {
        taxId: p.supplier.taxId,
        name: p.supplier.name,
        amount: '0',
        vat: '0',
        withholdingIncome: '0',
        withholdingVat: '0',
        _: [ZERO, ZERO, ZERO, ZERO],
      };
      const notes = p.debitNotes.reduce(
        (acc, n) => [
          acc[0].plus(n.subtotal),
          acc[1].plus(n.taxTotal),
          acc[2].plus(n.withholdingIncome),
          acc[3].plus(n.withholdingVat),
        ],
        [ZERO, ZERO, ZERO, ZERO],
      );
      current._ = [
        current._[0].plus(p.subtotal ?? p.totalAmount).minus(notes[0]),
        current._[1].plus(p.vatTotal).minus(notes[1]),
        current._[2].plus(p.withholdingIncome).minus(notes[2]),
        current._[3].plus(p.withholdingVat).minus(notes[3]),
      ];
      bySupplier.set(key, current);
    }
    const sales = await prisma.sale.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { gte: businessDayStart(from), lte: businessDayEnd(to) },
      },
      select: {
        subtotal: true,
        customer: { select: { documentNumber: true, name: true } },
        creditNotes: { select: { subtotal: true } },
      },
    });
    const byCustomer = new Map<
      string,
      { documentNumber: string; name: string; amount: Prisma.Decimal; returns: Prisma.Decimal }
    >();
    for (const s of sales) {
      const key = s.customer.documentNumber;
      const current = byCustomer.get(key) ?? {
        documentNumber: key,
        name: s.customer.name,
        amount: ZERO,
        returns: ZERO,
      };
      current.amount = current.amount.plus(s.subtotal);
      current.returns = current.returns.plus(
        s.creditNotes.reduce((sum, n) => sum.plus(n.subtotal), ZERO),
      );
      byCustomer.set(key, current);
    }
    return {
      year,
      draft: true,
      payments: [...bySupplier.values()]
        .map(({ _, ...row }) => ({
          ...row,
          amount: money(_[0]),
          vat: money(_[1]),
          withholdingIncome: money(_[2]),
          withholdingVat: money(_[3]),
        }))
        .sort((a, b) => a.taxId.localeCompare(b.taxId)),
      income: [...byCustomer.values()]
        .map((c) => ({
          documentNumber: c.documentNumber,
          name: c.name,
          amount: money(c.amount),
          returns: money(c.returns),
        }))
        .sort((a, b) => a.documentNumber.localeCompare(b.documentNumber)),
    };
  }
}
