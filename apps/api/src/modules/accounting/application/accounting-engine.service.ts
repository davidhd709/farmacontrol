import { businessDateOf, businessToday } from '../../../common/utils/business-date';
import { Injectable } from '@nestjs/common';
import { prisma, Prisma, AccountingPurpose as DbPurpose } from '@farmacia/database';
import { JournalService } from './journal.service';
import { JournalLineInput } from '../domain/journal-rules';
import { AccountingValidationError } from '../domain/accounting-rules';
import { centsToMoneyString, parseMoneyToCents } from '../../treasury/domain/treasury-rules';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface SaleEventInput {
  id: string;
  invoiceNumber: string;
  total: number | string | Prisma.Decimal;
  subtotal?: number | string | Prisma.Decimal;
  taxTotal?: number | string | Prisma.Decimal;
  /** Descuento comercial otorgado; se contabiliza aparte en SALES_DISCOUNTS. */
  discountTotal?: number | string | Prisma.Decimal;
  /** Costo retirado del submayor de valoración (ADR-005), no el costo del catálogo. */
  costOfSales: number | string | Prisma.Decimal;
  /** F6: impuesto nacional al consumo de la venta */
  incTotal?: number | string | Prisma.Decimal;
  /**
   * F6: ingreso bruto (antes de descuento) por tratamiento tributario, cuando el motor está
   * activo. Sin él la venta se contabiliza como antes del motor.
   */
  revenue?: { taxed: string; exempt: string; excluded: string };
  paymentMethod: string;
  createdById?: string | null;
  createdAt?: Date | string;
  lines: Array<{
    productId: string;
    quantityCommercial?: number | string | Prisma.Decimal;
    quantityBaseUnits?: number;
    presentationFactorHistorical?: number;
    lotAllocations?: Array<{
      lotId: string;
      quantityBaseUnits: number;
    }>;
  }>;
  /** Cuenta bancaria del movimiento: si está vinculada al PUC se usa su subcuenta */
  bankAccountId?: string | null;
}

export interface PurchaseEventInput {
  id: string;
  invoiceNumber: string;
  supplierName?: string;
  totalAmount: number | string | Prisma.Decimal;
  purchaseDate: Date | string;
  receivedByUserId?: string | null;
  /** F6: desglose del motor tributario; sin él la compra se contabiliza como antes */
  taxes?: {
    subtotal: string;
    vat: string;
    /** IVA descontable o mayor costo del inventario (empresa no responsable) */
    vatDeductible: boolean;
    withholdingIncome: string;
    withholdingVat: string;
    withholdingIca: string;
  };
}

export interface ReceivablePaymentEventInput {
  id: string;
  receivableId: string;
  amount: number | string | Prisma.Decimal;
  paymentMethod: string;
  createdByUserId?: string | null;
  customerName?: string;
  invoiceNumber?: string;
  /** Cuenta bancaria del movimiento: si está vinculada al PUC se usa su subcuenta */
  bankAccountId?: string | null;
}

export interface PayablePaymentEventInput {
  id: string;
  payableId: string;
  amount: number | string | Prisma.Decimal;
  paymentMethod: string;
  createdByUserId?: string | null;
  supplierName?: string;
  invoiceNumber?: string;
  /** Cuenta bancaria del movimiento: si está vinculada al PUC se usa su subcuenta */
  bankAccountId?: string | null;
}

export interface ExpenseEventInput {
  id: string;
  categoryId: string;
  categoryAccountId: string;
  description: string;
  beneficiary: string;
  documentNumber?: string | null;
  amount: number | string | Prisma.Decimal;
  paymentMethod: string;
  status: string;
  expenseDate: Date | string;
  createdById?: string | null;
  /** Cuenta bancaria del movimiento: si está vinculada al PUC se usa su subcuenta */
  bankAccountId?: string | null;
}

export interface ExpensePaymentEventInput {
  id: string;
  expenseId: string;
  amount: number | string | Prisma.Decimal;
  paymentMethod: string;
  beneficiary?: string;
  description?: string;
  documentNumber?: string | null;
  createdById?: string | null;
  paymentDate: Date | string;
  /** Cuenta bancaria del movimiento: si está vinculada al PUC se usa su subcuenta */
  bankAccountId?: string | null;
}

export interface CreditNoteEventInput {
  id: string;
  creditNoteNumber: string;
  saleId: string;
  saleInvoiceNumber?: string;
  customerId: string;
  customerName?: string;
  reason: string;
  subtotal: number | string | Prisma.Decimal;
  incTotal?: number | string | Prisma.Decimal;
  taxTotal: number | string | Prisma.Decimal;
  total: number | string | Prisma.Decimal;
  refundMethod: string;
  restock: boolean;
  costTotal?: number | string | Prisma.Decimal;
  createdById?: string | null;
  createdAt?: Date | string;
  /** Cuenta bancaria del movimiento: si está vinculada al PUC se usa su subcuenta */
  bankAccountId?: string | null;
}

export interface DebitNoteEventInput {
  id: string;
  debitNoteNumber: string;
  purchaseId: string;
  purchaseInvoiceNumber?: string;
  supplierId: string;
  supplierName?: string;
  reason: string;
  subtotal: number | string | Prisma.Decimal;
  taxTotal: number | string | Prisma.Decimal;
  total: number | string | Prisma.Decimal;
  /** Valor que la devolución retiró del submayor al costo promedio (ADR-005). */
  inventoryCost: number | string | Prisma.Decimal;
  /** Propósito de la diferencia frente al costo de compra, según la política de la empresa. */
  variancePurpose: 'COST_OF_SALES' | 'INVENTORY_COST_VARIANCE';
  /** F8: IVA descontable (se revierte de VAT_INPUT) o mayor costo (va a la diferencia) */
  vatDeductible?: boolean;
  /** F8: retenciones de la compra revertidas en proporción */
  withholdingIncome?: string;
  withholdingVat?: string;
  withholdingIca?: string;
  createdById?: string | null;
  createdAt?: Date | string;
}

@Injectable()
export class AccountingEngineService {
  constructor(private readonly journalService: JournalService) {}

  /** Resuelve la subcuenta PUC vinculada a una cuenta bancaria, si existe. */
  private async bankLedger(bankAccountId: string | null | undefined, client: Tx) {
    if (!bankAccountId) return null;
    const bank = await client.bankAccount.findUnique({
      where: { id: bankAccountId },
      select: { ledgerAccountId: true },
    });
    return bank?.ledgerAccountId ?? null;
  }

  private bindBank(lines: JournalLineInput[], ledger: string | null): JournalLineInput[] {
    return ledger
      ? lines.map((line) => (line.purpose === 'BANK' ? { ...line, accountId: ledger } : line))
      : lines;
  }

  /**
   * Genera el asiento contable automático al confirmar una venta en POS.
   * Partida doble balanceada:
   * Débito: CAJA o BANCOS (por el total)
   * Crédito: IVA GENERADO (si aplica)
   * Crédito: VENTAS GRAVADAS o VENTAS EXCLUIDAS (valor bruto, antes del descuento)
   * Débito: DESCUENTOS EN VENTAS 4175 (si hubo descuento)
   * Débito: COSTO DE VENTAS (si costo > 0)
   * Crédito: INVENTARIOS (si costo > 0)
   */
  async handleSaleConfirmed(sale: SaleEventInput, tx: Tx) {
    const client = tx;
    const totalCents = parseMoneyToCents(
      new Prisma.Decimal(sale.total).toFixed(2),
      'Total de venta',
    );
    if (totalCents <= 0n) {
      throw new AccountingValidationError(
        'El total de la venta debe ser mayor a cero para contabilizarla.',
      );
    }

    const taxCents = sale.taxTotal
      ? parseMoneyToCents(new Prisma.Decimal(sale.taxTotal).toFixed(2), 'IVA de venta')
      : 0n;
    const incCents = sale.incTotal
      ? parseMoneyToCents(new Prisma.Decimal(sale.incTotal).toFixed(2), 'INC de venta')
      : 0n;
    const subtotalCents = totalCents - taxCents - incCents;
    const discountCents = sale.discountTotal
      ? parseMoneyToCents(new Prisma.Decimal(sale.discountTotal).toFixed(2), 'Descuento de venta')
      : 0n;

    const paymentPurpose: DbPurpose =
      sale.paymentMethod === 'EFECTIVO'
        ? 'CASH'
        : sale.paymentMethod === 'CREDITO'
          ? 'CUSTOMERS'
          : 'BANK';

    // Costo de ventas: el valor que la venta retiró del submayor, al promedio vigente
    const cogsCents = parseMoneyToCents(
      new Prisma.Decimal(sale.costOfSales).toFixed(2),
      'Costo de ventas',
    );

    const entryDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
    const salesCreditCents = subtotalCents + discountCents;

    const bankLedger = await this.bankLedger(sale.bankAccountId, client);

    const lines: JournalLineInput[] = [];

    // Débito a Caja / Bancos
    lines.push({
      purpose: paymentPurpose,
      debit: centsToMoneyString(totalCents),
      credit: '0.00',
      description: `Ingreso por venta mostrador factura ${sale.invoiceNumber}`,
    });

    if (sale.revenue) {
      // F6: el motor tributario separa el ingreso por tratamiento y el INC por pagar
      if (taxCents > 0n) {
        lines.push({
          purpose: 'VAT_OUTPUT',
          debit: '0.00',
          credit: centsToMoneyString(taxCents),
          description: `IVA generado factura ${sale.invoiceNumber}`,
        });
      }
      if (incCents > 0n) {
        lines.push({
          purpose: 'INC_PAYABLE',
          debit: '0.00',
          credit: centsToMoneyString(incCents),
          description: `INC generado factura ${sale.invoiceNumber}`,
        });
      }
      const revenueLines: Array<[DbPurpose, string, string]> = [
        ['SALES_TAXED', sale.revenue.taxed, 'Venta gravada'],
        ['SALES_EXEMPT', sale.revenue.exempt, 'Venta exenta'],
        ['SALES_EXCLUDED', sale.revenue.excluded, 'Venta excluida o sin IVA'],
      ];
      for (const [purpose, amount, label] of revenueLines) {
        if (parseMoneyToCents(amount, label) > 0n) {
          lines.push({
            purpose,
            debit: '0.00',
            credit: amount,
            description: `${label} factura ${sale.invoiceNumber}`,
          });
        }
      }
    } else if (taxCents > 0n) {
      // Crédito a IVA generado si aplica
      lines.push({
        purpose: 'VAT_OUTPUT',
        debit: '0.00',
        credit: centsToMoneyString(taxCents),
        description: `IVA generado factura ${sale.invoiceNumber}`,
      });
      lines.push({
        purpose: 'SALES_TAXED',
        debit: '0.00',
        credit: centsToMoneyString(salesCreditCents),
        description: `Venta gravada factura ${sale.invoiceNumber}`,
      });
    } else {
      lines.push({
        purpose: 'SALES_EXCLUDED',
        debit: '0.00',
        credit: centsToMoneyString(salesCreditCents),
        description: `Venta excluida factura ${sale.invoiceNumber}`,
      });
    }

    if (discountCents > 0n) {
      lines.push({
        purpose: 'SALES_DISCOUNTS',
        debit: centsToMoneyString(discountCents),
        credit: '0.00',
        description: `Descuento otorgado factura ${sale.invoiceNumber}`,
      });
    }

    // Costo de ventas e inventario
    if (cogsCents > 0n) {
      const cogsStr = centsToMoneyString(cogsCents);
      lines.push({
        purpose: 'COST_OF_SALES',
        debit: cogsStr,
        credit: '0.00',
        description: `Costo de mercancía vendida factura ${sale.invoiceNumber}`,
      });
      lines.push({
        purpose: 'INVENTORY',
        debit: '0.00',
        credit: cogsStr,
        description: `Salida de inventario factura ${sale.invoiceNumber}`,
      });
    }

    return this.journalService.post(
      {
        entryDate: businessDateOf(entryDate),
        description: `Venta mostrador comprobante ${sale.invoiceNumber}`,
        sourceType: 'SALE',
        sourceId: sale.id,
        createdById: sale.createdById ?? undefined,
        lines: this.bindBank(lines, bankLedger),
      },
      tx,
    );
  }

  /**
   * Reversa el asiento contable al anular una venta.
   */
  async handleSaleCancelled(saleId: string, reason: string, userId: string | undefined, tx: Tx) {
    const client = tx;
    const existing = await client.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: 'SALE', sourceId: saleId } },
    });
    if (!existing || existing.status !== 'POSTED') {
      throw new AccountingValidationError(
        `La venta ${saleId} no tiene un asiento publicado para reversar; la anulación fue detenida.`,
      );
    }

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { reversalOfId: existing.id },
    });
    if (alreadyReversed) return alreadyReversed;

    return this.journalService.reverse(
      {
        entryId: existing.id,
        entryDate: businessToday(),
        reason,
        createdById: userId,
      },
      tx,
    );
  }

  /**
   * Genera el asiento contable automático al recepcionar una compra.
   * Débito: INVENTARIOS
   * Crédito: PROVEEDORES
   */
  async handlePurchaseReceived(purchase: PurchaseEventInput, tx: Tx) {
    const totalCents = parseMoneyToCents(
      new Prisma.Decimal(purchase.totalAmount).toFixed(2),
      'Total de compra',
    );
    if (totalCents <= 0n) {
      throw new AccountingValidationError(
        'El total de la compra debe ser mayor a cero para contabilizarla.',
      );
    }

    const purchaseDate = new Date(purchase.purchaseDate);
    const totalStr = centsToMoneyString(totalCents);
    const lines: JournalLineInput[] = purchase.taxes
      ? this.taxedPurchaseLines(purchase, totalCents)
      : [
          {
            purpose: 'INVENTORY',
            debit: totalStr,
            credit: '0.00',
            description: `Entrada a inventario factura compra ${purchase.invoiceNumber}`,
          },
          {
            purpose: 'SUPPLIERS',
            debit: '0.00',
            credit: totalStr,
            description: `Causación factura proveedor ${purchase.supplierName || purchase.invoiceNumber}`,
          },
        ];

    return this.journalService.post(
      {
        entryDate: purchaseDate.toISOString().slice(0, 10),
        description: `Recepción factura compra ${purchase.invoiceNumber}${purchase.supplierName ? ' - ' + purchase.supplierName : ''}`,
        sourceType: 'PURCHASE',
        sourceId: purchase.id,
        createdById: purchase.receivedByUserId ?? undefined,
        lines,
      },
      tx,
    );
  }

  /**
   * F6: inventario por el subtotal (más el IVA si no es descontable), IVA descontable,
   * proveedor por el neto y cada retención practicada por pagar.
   */
  private taxedPurchaseLines(purchase: PurchaseEventInput, totalCents: bigint): JournalLineInput[] {
    const t = purchase.taxes!;
    const cents = (value: string, label: string) => parseMoneyToCents(value, label);
    const subtotalCents = cents(t.subtotal, 'Subtotal de compra');
    const vatCents = cents(t.vat, 'IVA de compra');
    const withholdings: Array<[DbPurpose, bigint, string]> = [
      [
        'WITHHOLDING_INCOME_PAYABLE',
        cents(t.withholdingIncome, 'Retención en la fuente'),
        'Retención en la fuente',
      ],
      ['WITHHOLDING_VAT_PAYABLE', cents(t.withholdingVat, 'ReteIVA'), 'Retención de IVA'],
      ['WITHHOLDING_ICA_PAYABLE', cents(t.withholdingIca, 'ReteICA'), 'Retención de ICA'],
    ];
    const withheldCents = withholdings.reduce((sum, [, amount]) => sum + amount, 0n);
    const inventoryCents = subtotalCents + (t.vatDeductible ? 0n : vatCents);
    const lines: JournalLineInput[] = [
      {
        purpose: 'INVENTORY',
        debit: centsToMoneyString(inventoryCents),
        credit: '0.00',
        description: `Entrada a inventario factura compra ${purchase.invoiceNumber}`,
      },
    ];
    if (t.vatDeductible && vatCents > 0n) {
      lines.push({
        purpose: 'VAT_INPUT',
        debit: centsToMoneyString(vatCents),
        credit: '0.00',
        description: `IVA descontable factura compra ${purchase.invoiceNumber}`,
      });
    }
    lines.push({
      purpose: 'SUPPLIERS',
      debit: '0.00',
      credit: centsToMoneyString(totalCents - withheldCents),
      description: `Causación factura proveedor ${purchase.supplierName || purchase.invoiceNumber}`,
    });
    for (const [purpose, amount, label] of withholdings) {
      if (amount > 0n) {
        lines.push({
          purpose,
          debit: '0.00',
          credit: centsToMoneyString(amount),
          description: `${label} factura compra ${purchase.invoiceNumber}`,
        });
      }
    }
    return lines;
  }

  /**
   * Genera el asiento contable automático al abonar a una cuenta por cobrar.
   * Débito: CAJA o BANCOS
   * Crédito: CLIENTES
   */
  async handleCustomerPayment(payment: ReceivablePaymentEventInput, tx: Tx) {
    const client = tx;
    const amountCents = parseMoneyToCents(
      new Prisma.Decimal(payment.amount).toFixed(2),
      'Monto del abono',
    );
    if (amountCents <= 0n) {
      throw new AccountingValidationError('El abono debe ser mayor a cero para contabilizarlo.');
    }

    const paymentPurpose: DbPurpose = payment.paymentMethod === 'EFECTIVO' ? 'CASH' : 'BANK';

    const now = new Date();
    const bankLedger = await this.bankLedger(payment.bankAccountId, client);
    const amountStr = centsToMoneyString(amountCents);
    const lines: JournalLineInput[] = [
      {
        purpose: paymentPurpose,
        debit: amountStr,
        credit: '0.00',
        description: `Cobro de cartera${payment.invoiceNumber ? ' factura ' + payment.invoiceNumber : ''}`,
      },
      {
        purpose: 'CUSTOMERS',
        debit: '0.00',
        credit: amountStr,
        description: `Abono de cliente${payment.customerName ? ' ' + payment.customerName : ''}`,
      },
    ];

    return this.journalService.post(
      {
        entryDate: businessDateOf(now),
        description: `Abono cartera${payment.invoiceNumber ? ' factura ' + payment.invoiceNumber : ''}${payment.customerName ? ' - ' + payment.customerName : ''}`,
        sourceType: 'RECEIVABLE_PAYMENT',
        sourceId: payment.id,
        createdById: payment.createdByUserId ?? undefined,
        lines: this.bindBank(lines, bankLedger),
      },
      tx,
    );
  }

  /**
   * Reversa el asiento contable al anular un abono de cliente.
   */
  async handleCustomerPaymentReversed(
    paymentId: string,
    reason: string,
    userId: string | undefined,
    tx: Tx,
  ) {
    const client = tx;
    const existing = await client.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: 'RECEIVABLE_PAYMENT', sourceId: paymentId } },
    });
    if (!existing || existing.status !== 'POSTED') {
      throw new AccountingValidationError(
        `El abono ${paymentId} no tiene un asiento publicado para reversar; la reversión fue detenida.`,
      );
    }

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { reversalOfId: existing.id },
    });
    if (alreadyReversed) return alreadyReversed;

    return this.journalService.reverse(
      {
        entryId: existing.id,
        entryDate: businessToday(),
        reason,
        createdById: userId,
      },
      tx,
    );
  }

  /**
   * Genera el asiento contable automático al pagar a un proveedor.
   * Débito: PROVEEDORES
   * Crédito: CAJA o BANCOS
   */
  async handleSupplierPayment(payment: PayablePaymentEventInput, tx: Tx) {
    const client = tx;
    const amountCents = parseMoneyToCents(
      new Prisma.Decimal(payment.amount).toFixed(2),
      'Monto del pago a proveedor',
    );
    if (amountCents <= 0n) {
      throw new AccountingValidationError('El pago debe ser mayor a cero para contabilizarlo.');
    }

    const paymentPurpose: DbPurpose = payment.paymentMethod === 'EFECTIVO' ? 'CASH' : 'BANK';

    const now = new Date();
    const bankLedger = await this.bankLedger(payment.bankAccountId, client);
    const amountStr = centsToMoneyString(amountCents);
    const lines: JournalLineInput[] = [
      {
        purpose: 'SUPPLIERS',
        debit: amountStr,
        credit: '0.00',
        description: `Cancelación obligación proveedor${payment.supplierName ? ' ' + payment.supplierName : ''}`,
      },
      {
        purpose: paymentPurpose,
        debit: '0.00',
        credit: amountStr,
        description: `Egreso por pago proveedor${payment.invoiceNumber ? ' factura ' + payment.invoiceNumber : ''}`,
      },
    ];

    return this.journalService.post(
      {
        entryDate: businessDateOf(now),
        description: `Pago a proveedor${payment.invoiceNumber ? ' factura ' + payment.invoiceNumber : ''}${payment.supplierName ? ' - ' + payment.supplierName : ''}`,
        sourceType: 'PAYABLE_PAYMENT',
        sourceId: payment.id,
        createdById: payment.createdByUserId ?? undefined,
        lines: this.bindBank(lines, bankLedger),
      },
      tx,
    );
  }

  /**
   * Reversa el asiento contable al revertir un pago a proveedor.
   */
  async handleSupplierPaymentReversed(
    paymentId: string,
    reason: string,
    userId: string | undefined,
    tx: Tx,
  ) {
    const client = tx;
    const existing = await client.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: 'PAYABLE_PAYMENT', sourceId: paymentId } },
    });
    if (!existing || existing.status !== 'POSTED') {
      throw new AccountingValidationError(
        `El pago a proveedor ${paymentId} no tiene un asiento publicado para reversar; la reversión fue detenida.`,
      );
    }

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { reversalOfId: existing.id },
    });
    if (alreadyReversed) return alreadyReversed;

    return this.journalService.reverse(
      {
        entryId: existing.id,
        entryDate: businessToday(),
        reason,
        createdById: userId,
      },
      tx,
    );
  }

  // ------------------------------------------------------------------ //
  //  Gastos Operativos (Bloque 4 / Fase 4)
  // ------------------------------------------------------------------ //

  /**
   * Contabiliza el registro de un gasto operativo (de contado o a crédito).
   */
  async handleExpenseCreated(expense: ExpenseEventInput, tx: Tx) {
    const date = new Date(expense.expenseDate);
    const amountCents = parseMoneyToCents(expense.amount.toString(), 'Monto de gasto');
    if (amountCents <= 0n) {
      throw new AccountingValidationError('El gasto debe ser mayor a cero para contabilizarlo.');
    }
    const amountStr = centsToMoneyString(amountCents);

    const isPaid = expense.status === 'PAGADO';
    const isBank = expense.paymentMethod === 'TRANSFERENCIA';
    const contraPurpose = isPaid ? (isBank ? DbPurpose.BANK : DbPurpose.CASH) : DbPurpose.SUPPLIERS;

    // Verificar si se puede postear con la contrapartida requerida
    const bankLedger = isPaid ? await this.bankLedger(expense.bankAccountId, tx) : null;

    const lines: JournalLineInput[] = [
      {
        accountId: expense.categoryAccountId,
        debit: amountStr,
        credit: '0.00',
        description: `Gasto: ${expense.description}`,
      },
      {
        purpose: contraPurpose,
        debit: '0.00',
        credit: amountStr,
        description: isPaid
          ? `Desembolso gasto: ${expense.beneficiary}`
          : `Causación pasivo por pagar: ${expense.beneficiary}`,
      },
    ];

    return this.journalService.post(
      {
        entryDate: date.toISOString().slice(0, 10),
        description: `Gasto - ${expense.beneficiary}: ${expense.description}`,
        sourceType: 'EXPENSE',
        sourceId: expense.id,
        createdById: expense.createdById ?? undefined,
        lines: this.bindBank(lines, bankLedger),
      },
      tx,
    );
  }

  /**
   * Reversa el asiento contable de un gasto cancelado / anulado.
   */
  async handleExpenseCancelled(
    expenseId: string,
    reason: string,
    userId: string | undefined,
    tx: Tx,
  ) {
    const client = tx;
    const existing = await client.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: 'EXPENSE', sourceId: expenseId } },
    });
    if (!existing || existing.status !== 'POSTED') {
      throw new AccountingValidationError(
        `El gasto ${expenseId} no tiene un asiento publicado para reversar; la anulación fue detenida.`,
      );
    }

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { reversalOfId: existing.id },
    });
    if (alreadyReversed) return alreadyReversed;

    return this.journalService.reverse(
      {
        entryId: existing.id,
        entryDate: businessToday(),
        reason,
        createdById: userId,
      },
      tx,
    );
  }

  /**
   * Contabiliza el pago posterior de un gasto pendiente.
   * Regla contable: cancela el pasivo (SUPPLIERS) contra tesorería (CASH/BANK).
   * ¡No duplica el gasto!
   */
  async handleExpensePayment(payment: ExpensePaymentEventInput, tx: Tx) {
    const date = new Date(payment.paymentDate);
    const amountCents = parseMoneyToCents(payment.amount.toString(), 'Monto de pago de gasto');
    if (amountCents <= 0n) {
      throw new AccountingValidationError(
        'El pago del gasto debe ser mayor a cero para contabilizarlo.',
      );
    }
    const amountStr = centsToMoneyString(amountCents);

    const isBank = payment.paymentMethod === 'TRANSFERENCIA';
    const paymentPurpose = isBank ? DbPurpose.BANK : DbPurpose.CASH;

    const bankLedger = await this.bankLedger(payment.bankAccountId, tx);

    const lines: JournalLineInput[] = [
      {
        purpose: DbPurpose.SUPPLIERS,
        debit: amountStr,
        credit: '0.00',
        description: `Cancelación pasivo gasto: ${payment.beneficiary || payment.expenseId}`,
      },
      {
        purpose: paymentPurpose,
        debit: '0.00',
        credit: amountStr,
        description: `Egreso tesorería pago gasto (${payment.paymentMethod}): ${payment.beneficiary || payment.expenseId}`,
      },
    ];

    return this.journalService.post(
      {
        entryDate: date.toISOString().slice(0, 10),
        description: `Pago gasto a ${payment.beneficiary || ''} (${payment.paymentMethod})${payment.documentNumber ? ' doc ' + payment.documentNumber : ''}`,
        sourceType: 'EXPENSE_PAYMENT',
        sourceId: payment.id,
        createdById: payment.createdById ?? undefined,
        lines: this.bindBank(lines, bankLedger),
      },
      tx,
    );
  }

  /**
   * Reversa el asiento contable al revertir un pago de gasto.
   */
  async handleExpensePaymentReversed(
    paymentId: string,
    reason: string,
    userId: string | undefined,
    tx: Tx,
  ) {
    const client = tx;
    const existing = await client.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: 'EXPENSE_PAYMENT', sourceId: paymentId } },
    });
    if (!existing || existing.status !== 'POSTED') {
      throw new AccountingValidationError(
        `El pago de gasto ${paymentId} no tiene un asiento publicado para reversar; la reversión fue detenida.`,
      );
    }

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { reversalOfId: existing.id },
    });
    if (alreadyReversed) return alreadyReversed;

    return this.journalService.reverse(
      {
        entryId: existing.id,
        entryDate: businessToday(),
        reason,
        createdById: userId,
      },
      tx,
    );
  }

  /**
   * Genera el asiento contable automático al confirmar una Nota Crédito en ventas (RF-033).
   * Partida doble balanceada:
   * Débito: DEVOLUCIONES EN VENTAS (4175) por subtotal
   * Débito: IVA GENERADO (2408) por impuesto devuelto (si aplica)
   * Crédito: CLIENTES / CAJA / BANCOS por el total devuelto
   * Si restock:
   * Débito: INVENTARIO (1435) por el costo de reposición
   * Crédito: COSTO DE VENTAS (6135) por el costo revertido
   */
  async handleCreditNoteConfirmed(note: CreditNoteEventInput, tx: Tx) {
    const client = tx;
    const totalCents = parseMoneyToCents(
      new Prisma.Decimal(note.total).toFixed(2),
      'Total de nota crédito',
    );
    if (totalCents <= 0n) {
      throw new AccountingValidationError(
        'El total de la nota crédito debe ser mayor a cero para contabilizarla.',
      );
    }

    const taxCents = note.taxTotal
      ? parseMoneyToCents(new Prisma.Decimal(note.taxTotal).toFixed(2), 'IVA de nota crédito')
      : 0n;
    const incCents = note.incTotal
      ? parseMoneyToCents(new Prisma.Decimal(note.incTotal).toFixed(2), 'INC de nota crédito')
      : 0n;
    const subtotalCents = totalCents - taxCents - incCents;

    const cogsCents = note.costTotal
      ? parseMoneyToCents(new Prisma.Decimal(note.costTotal).toFixed(2), 'Costo revertido')
      : 0n;

    const paymentPurpose: DbPurpose =
      note.refundMethod === 'CREDITO_CARTERA'
        ? 'CUSTOMERS'
        : note.refundMethod === 'EFECTIVO'
          ? 'CASH'
          : 'BANK';

    const entryDate = note.createdAt ? new Date(note.createdAt) : new Date();

    const bankLedger = await this.bankLedger(note.bankAccountId, client);
    const lines: JournalLineInput[] = [];

    // Débito a Devoluciones en Ventas (4175)
    lines.push({
      purpose: 'SALES_RETURNS',
      debit: centsToMoneyString(subtotalCents),
      credit: '0.00',
      description: `Devolución en ventas NC ${note.creditNoteNumber}${note.saleInvoiceNumber ? ' s/factura ' + note.saleInvoiceNumber : ''}`,
    });

    // Débito a IVA Generado (2408)
    if (taxCents > 0n) {
      lines.push({
        purpose: 'VAT_OUTPUT',
        debit: centsToMoneyString(taxCents),
        credit: '0.00',
        description: `IVA revertido por devolución NC ${note.creditNoteNumber}`,
      });
    }

    // F8: débito al INC por pagar devuelto
    if (incCents > 0n) {
      lines.push({
        purpose: 'INC_PAYABLE',
        debit: centsToMoneyString(incCents),
        credit: '0.00',
        description: `INC revertido por devolución NC ${note.creditNoteNumber}`,
      });
    }

    // Crédito a Clientes / Caja / Bancos
    lines.push({
      purpose: paymentPurpose,
      debit: '0.00',
      credit: centsToMoneyString(totalCents),
      description: `Reembolso / ajuste cartera NC ${note.creditNoteNumber} a ${note.customerName || 'Cliente'}`,
    });

    // Reversión de Costo de Ventas e Inventario si hubo reintegro
    if (note.restock && cogsCents > 0n) {
      lines.push({
        purpose: 'INVENTORY',
        debit: centsToMoneyString(cogsCents),
        credit: '0.00',
        description: `Reintegro físico de mercancía a inventario NC ${note.creditNoteNumber}`,
      });
      lines.push({
        purpose: 'COST_OF_SALES',
        debit: '0.00',
        credit: centsToMoneyString(cogsCents),
        description: `Reversión costo de mercancía devuelta NC ${note.creditNoteNumber}`,
      });
    }

    return this.journalService.post(
      {
        entryDate: businessDateOf(entryDate),
        description: `Nota Crédito ${note.creditNoteNumber} (${note.reason})${note.saleInvoiceNumber ? ' s/factura ' + note.saleInvoiceNumber : ''}`,
        sourceType: 'CREDIT_NOTE',
        sourceId: note.id,
        createdById: note.createdById ?? undefined,
        lines: this.bindBank(lines, bankLedger),
      },
      tx,
    );
  }

  /**
   * Genera el asiento contable automático al confirmar una Nota Débito a proveedor en compras (RF-033).
   * Partida doble balanceada:
   * Débito: PROVEEDORES (2205) por el total
   * Crédito: INVENTARIO (1435) por el costo de la mercancía devuelta
   * Crédito: IVA DESCONTABLE (2408) por el IVA descontable devuelto al proveedor
   */
  async handleDebitNoteConfirmed(note: DebitNoteEventInput, tx: Tx) {
    const totalCents = parseMoneyToCents(
      new Prisma.Decimal(note.total).toFixed(2),
      'Total de nota débito',
    );
    if (totalCents <= 0n) {
      throw new AccountingValidationError(
        'El total de la nota débito debe ser mayor a cero para contabilizarla.',
      );
    }

    const taxCents = note.taxTotal
      ? parseMoneyToCents(new Prisma.Decimal(note.taxTotal).toFixed(2), 'IVA de nota débito')
      : 0n;
    const vatDeductible = note.vatDeductible !== false;
    // Sin IVA descontable, el IVA fue mayor costo: se compara con el costo devuelto
    const subtotalCents = totalCents - (vatDeductible ? taxCents : 0n);
    const withholdings: Array<[DbPurpose, bigint, string]> = [
      [
        'WITHHOLDING_INCOME_PAYABLE',
        parseMoneyToCents(note.withholdingIncome ?? '0', 'Retención'),
        'retención en la fuente',
      ],
      [
        'WITHHOLDING_VAT_PAYABLE',
        parseMoneyToCents(note.withholdingVat ?? '0', 'ReteIVA'),
        'retención de IVA',
      ],
      [
        'WITHHOLDING_ICA_PAYABLE',
        parseMoneyToCents(note.withholdingIca ?? '0', 'ReteICA'),
        'retención de ICA',
      ],
    ];
    const withheldCents = withholdings.reduce((sum, [, amount]) => sum + amount, 0n);

    const entryDate = note.createdAt ? new Date(note.createdAt) : new Date();

    const lines: JournalLineInput[] = [];

    // Débito a Proveedores (2205) por el neto: las retenciones se revierten aparte
    lines.push({
      purpose: 'SUPPLIERS',
      debit: centsToMoneyString(totalCents - withheldCents),
      credit: '0.00',
      description: `Nota Débito ND ${note.debitNoteNumber} a proveedor ${note.supplierName || ''}`,
    });
    for (const [purpose, amount, label] of withholdings) {
      if (amount > 0n) {
        lines.push({
          purpose,
          debit: centsToMoneyString(amount),
          credit: '0.00',
          description: `Reversión de ${label} ND ${note.debitNoteNumber}`,
        });
      }
    }

    // Crédito a Inventario (1435) por el valor que salió del submayor al costo promedio
    const inventoryCents = parseMoneyToCents(
      new Prisma.Decimal(note.inventoryCost).toFixed(2),
      'Costo de inventario devuelto',
    );
    if (inventoryCents > 0n) {
      lines.push({
        purpose: 'INVENTORY',
        debit: '0.00',
        credit: centsToMoneyString(inventoryCents),
        description: `Salida de mercancía devuelta a proveedor ND ${note.debitNoteNumber}`,
      });
    }
    // La diferencia entre el costo de compra devuelto y el promedio va al propósito que
    // eligió la empresa (ADR-006): costo de ventas o una cuenta propia de diferencias
    const varianceCents = subtotalCents - inventoryCents;
    if (varianceCents !== 0n) {
      lines.push({
        purpose: note.variancePurpose,
        debit: varianceCents < 0n ? centsToMoneyString(-varianceCents) : '0.00',
        credit: varianceCents > 0n ? centsToMoneyString(varianceCents) : '0.00',
        description: `Diferencia entre costo de compra y costo promedio ND ${note.debitNoteNumber}`,
      });
    }

    // Crédito a IVA Descontable (2408)
    if (vatDeductible && taxCents > 0n) {
      lines.push({
        purpose: 'VAT_INPUT',
        debit: '0.00',
        credit: centsToMoneyString(taxCents),
        description: `Reversión IVA descontable devolución compra ND ${note.debitNoteNumber}`,
      });
    }

    return this.journalService.post(
      {
        entryDate: businessDateOf(entryDate),
        description: `Nota Débito ${note.debitNoteNumber} (${note.reason})${note.purchaseInvoiceNumber ? ' s/factura ' + note.purchaseInvoiceNumber : ''}`,
        sourceType: 'DEBIT_NOTE',
        sourceId: note.id,
        createdById: note.createdById ?? undefined,
        lines,
      },
      tx,
    );
  }

  /**
   * F8: ajuste de inventario o existencia inicial manual al costo que entró o salió del
   * submayor. Entrada: inventario contra sobrantes; salida: faltantes y bajas contra inventario.
   * Sin valor no hay asiento.
   */
  async handleInventoryAdjustment(
    adjustment: {
      sourceType: 'INVENTORY_ADJUSTMENT' | 'INVENTORY_INITIAL';
      sourceId: string;
      direction: 'IN' | 'OUT';
      valueCents: bigint;
      description: string;
      createdById?: string | null;
    },
    tx: Tx,
  ) {
    if (adjustment.valueCents <= 0n) return null;
    const value = centsToMoneyString(adjustment.valueCents);
    const counterpart: DbPurpose =
      adjustment.direction === 'IN' ? 'INVENTORY_SURPLUS' : 'INVENTORY_SHRINKAGE';
    const lines: JournalLineInput[] =
      adjustment.direction === 'IN'
        ? [
            {
              purpose: 'INVENTORY',
              debit: value,
              credit: '0.00',
              description: adjustment.description,
            },
            {
              purpose: counterpart,
              debit: '0.00',
              credit: value,
              description: adjustment.description,
            },
          ]
        : [
            {
              purpose: counterpart,
              debit: value,
              credit: '0.00',
              description: adjustment.description,
            },
            {
              purpose: 'INVENTORY',
              debit: '0.00',
              credit: value,
              description: adjustment.description,
            },
          ];
    return this.journalService.post(
      {
        entryDate: businessDateOf(new Date()),
        description: adjustment.description,
        sourceType: adjustment.sourceType,
        sourceId: adjustment.sourceId,
        createdById: adjustment.createdById ?? undefined,
        lines,
      },
      tx,
    );
  }

  /**
   * F8: movimiento manual de caja o de banco contra la cuenta de contrapartida que eligió el
   * usuario. Ingreso: caja o banco al débito; egreso: al crédito.
   */
  async handleManualTreasuryMovement(
    movement: {
      sourceType: 'CASH_MOVEMENT' | 'BANK_MOVEMENT';
      sourceId: string;
      direction: 'IN' | 'OUT';
      amount: string;
      counterpartAccountId: string;
      bankAccountId?: string | null;
      description: string;
      entryDate?: string;
      createdById?: string | null;
    },
    tx: Tx,
  ) {
    const purpose: DbPurpose = movement.sourceType === 'CASH_MOVEMENT' ? 'CASH' : 'BANK';
    const treasury: JournalLineInput = {
      purpose,
      debit: movement.direction === 'IN' ? movement.amount : '0.00',
      credit: movement.direction === 'OUT' ? movement.amount : '0.00',
      description: movement.description,
    };
    const counterpart: JournalLineInput = {
      accountId: movement.counterpartAccountId,
      debit: movement.direction === 'OUT' ? movement.amount : '0.00',
      credit: movement.direction === 'IN' ? movement.amount : '0.00',
      description: movement.description,
    };
    const ledger = await this.bankLedger(movement.bankAccountId, tx);
    return this.journalService.post(
      {
        entryDate: movement.entryDate ?? businessDateOf(new Date()),
        description: movement.description,
        sourceType: movement.sourceType,
        sourceId: movement.sourceId,
        createdById: movement.createdById ?? undefined,
        lines: this.bindBank([treasury, counterpart], ledger),
      },
      tx,
    );
  }

  /** Reversa el asiento de un origen, si lo tiene (p. ej. un movimiento bancario revertido). */
  async reverseSourceEntry(
    sourceType: string,
    sourceId: string,
    reason: string,
    userId: string | undefined,
    tx: Tx,
  ) {
    const entry = await this.journalService.findBySource(sourceType, sourceId, tx);
    if (!entry || entry.status !== 'POSTED') return null;
    return this.journalService.reverse(
      {
        entryId: entry.id,
        entryDate: businessDateOf(new Date()),
        reason,
        createdById: userId,
      },
      tx,
    );
  }
}
