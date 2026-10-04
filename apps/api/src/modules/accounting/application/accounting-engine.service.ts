import { Injectable, Logger } from '@nestjs/common';
import { prisma, Prisma, AccountingPurpose as DbPurpose } from '@farmacia/database';
import { JournalService } from './journal.service';
import { JournalLineInput } from '../domain/journal-rules';
import { centsToMoneyString, parseMoneyToCents } from '../../treasury/domain/treasury-rules';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface SaleEventInput {
  id: string;
  invoiceNumber: string;
  total: number | string | Prisma.Decimal;
  subtotal?: number | string | Prisma.Decimal;
  taxTotal?: number | string | Prisma.Decimal;
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
}

export interface PurchaseEventInput {
  id: string;
  invoiceNumber: string;
  supplierName?: string;
  totalAmount: number | string | Prisma.Decimal;
  purchaseDate: Date | string;
  receivedByUserId?: string | null;
}

export interface ReceivablePaymentEventInput {
  id: string;
  receivableId: string;
  amount: number | string | Prisma.Decimal;
  paymentMethod: string;
  createdByUserId?: string | null;
  customerName?: string;
  invoiceNumber?: string;
}

export interface PayablePaymentEventInput {
  id: string;
  payableId: string;
  amount: number | string | Prisma.Decimal;
  paymentMethod: string;
  createdByUserId?: string | null;
  supplierName?: string;
  invoiceNumber?: string;
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
}

@Injectable()
export class AccountingEngineService {
  private readonly logger = new Logger(AccountingEngineService.name);

  constructor(private readonly journalService: JournalService) {}

  /**
   * Genera el asiento contable automático al confirmar una venta en POS.
   * Partida doble balanceada:
   * Débito: CAJA o BANCOS (por el total)
   * Crédito: IVA GENERADO (si aplica)
   * Crédito: VENTAS GRAVADAS o VENTAS EXCLUIDAS (por el subtotal)
   * Débito: COSTO DE VENTAS (si costo > 0)
   * Crédito: INVENTARIOS (si costo > 0)
   */
  async handleSaleConfirmed(sale: SaleEventInput, tx?: Tx) {
    const client = tx ?? prisma;
    const totalCents = parseMoneyToCents(
      new Prisma.Decimal(sale.total).toFixed(2),
      'Total de venta',
    );
    if (totalCents <= 0n) return null;

    const taxCents = sale.taxTotal
      ? parseMoneyToCents(new Prisma.Decimal(sale.taxTotal).toFixed(2), 'IVA de venta')
      : 0n;
    const subtotalCents = totalCents - taxCents;

    const paymentPurpose: DbPurpose =
      sale.paymentMethod === 'EFECTIVO'
        ? 'CASH'
        : sale.paymentMethod === 'CREDITO'
          ? 'CUSTOMERS'
          : 'BANK';

    // Calcular costo de mercancía vendida (COGS) a partir de los lotes y costo base de productos
    let cogsCents = 0n;
    const productIds = Array.from(new Set(sale.lines.map((l) => l.productId)));
    if (productIds.length > 0) {
      const products = await client.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, baseCost: true },
      });
      const costMap = new Map<string, bigint>();
      for (const p of products) {
        costMap.set(
          p.id,
          parseMoneyToCents(new Prisma.Decimal(p.baseCost).toFixed(2), 'Costo base'),
        );
      }

      for (const line of sale.lines) {
        const unitCost = costMap.get(line.productId) ?? 0n;
        if (unitCost <= 0n) continue;

        if (line.lotAllocations && line.lotAllocations.length > 0) {
          for (const alloc of line.lotAllocations) {
            cogsCents += BigInt(alloc.quantityBaseUnits) * unitCost;
          }
        } else {
          const units =
            line.quantityBaseUnits ??
            Math.round(
              Number(line.quantityCommercial || 1) * (line.presentationFactorHistorical || 1),
            );
          cogsCents += BigInt(units) * unitCost;
        }
      }
    }

    const requiredPurposes: DbPurpose[] = [paymentPurpose];
    if (taxCents > 0n) {
      requiredPurposes.push('VAT_OUTPUT', 'SALES_TAXED');
    } else {
      requiredPurposes.push('SALES_EXCLUDED');
    }
    if (cogsCents > 0n) {
      requiredPurposes.push('COST_OF_SALES', 'INVENTORY');
    }

    const entryDate = sale.createdAt ? new Date(sale.createdAt) : new Date();

    const canPost = await this.journalService.canPostForPurposes(requiredPurposes, entryDate, client);
    if (!canPost) {
      this.logger.warn(
        `Venta ${sale.invoiceNumber}: propósitos contables pendientes de mapeo. Se omite asiento automático.`,
      );
      return null;
    }

    const lines: JournalLineInput[] = [];

    // Débito a Caja / Bancos
    lines.push({
      purpose: paymentPurpose,
      debit: centsToMoneyString(totalCents),
      credit: '0.00',
      description: `Ingreso por venta mostrador factura ${sale.invoiceNumber}`,
    });

    // Crédito a IVA generado si aplica
    if (taxCents > 0n) {
      lines.push({
        purpose: 'VAT_OUTPUT',
        debit: '0.00',
        credit: centsToMoneyString(taxCents),
        description: `IVA generado factura ${sale.invoiceNumber}`,
      });
      lines.push({
        purpose: 'SALES_TAXED',
        debit: '0.00',
        credit: centsToMoneyString(subtotalCents),
        description: `Venta gravada factura ${sale.invoiceNumber}`,
      });
    } else {
      lines.push({
        purpose: 'SALES_EXCLUDED',
        debit: '0.00',
        credit: centsToMoneyString(subtotalCents),
        description: `Venta excluida factura ${sale.invoiceNumber}`,
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
        entryDate: entryDate.toISOString().slice(0, 10),
        description: `Venta mostrador comprobante ${sale.invoiceNumber}`,
        sourceType: 'SALE',
        sourceId: sale.id,
        createdById: sale.createdById ?? undefined,
        lines,
      },
      tx,
    );
  }

  /**
   * Reversa el asiento contable al anular una venta.
   */
  async handleSaleCancelled(saleId: string, reason: string, userId?: string, tx?: Tx) {
    const client = tx ?? prisma;
    const existing = await client.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: 'SALE', sourceId: saleId } },
    });
    if (!existing || existing.status !== 'POSTED') return null;

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { reversalOfId: existing.id },
    });
    if (alreadyReversed) return alreadyReversed;

    return this.journalService.reverse(
      {
        entryId: existing.id,
        entryDate: new Date().toISOString().slice(0, 10),
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
  async handlePurchaseReceived(purchase: PurchaseEventInput, tx?: Tx) {
    const client = tx ?? prisma;
    const totalCents = parseMoneyToCents(
      new Prisma.Decimal(purchase.totalAmount).toFixed(2),
      'Total de compra',
    );
    if (totalCents <= 0n) return null;

    const purchaseDate = new Date(purchase.purchaseDate);
    const canPost = await this.journalService.canPostForPurposes(
      ['INVENTORY', 'SUPPLIERS'],
      purchaseDate,
      client,
    );
    if (!canPost) {
      this.logger.warn(
        `Compra ${purchase.invoiceNumber}: propósitos INVENTORY/SUPPLIERS pendientes de mapeo. Se omite asiento.`,
      );
      return null;
    }

    const totalStr = centsToMoneyString(totalCents);
    const lines: JournalLineInput[] = [
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
   * Genera el asiento contable automático al abonar a una cuenta por cobrar.
   * Débito: CAJA o BANCOS
   * Crédito: CLIENTES
   */
  async handleCustomerPayment(payment: ReceivablePaymentEventInput, tx?: Tx) {
    const client = tx ?? prisma;
    const amountCents = parseMoneyToCents(
      new Prisma.Decimal(payment.amount).toFixed(2),
      'Monto del abono',
    );
    if (amountCents <= 0n) return null;

    const paymentPurpose: DbPurpose =
      payment.paymentMethod === 'EFECTIVO' ? 'CASH' : 'BANK';

    const now = new Date();
    const canPost = await this.journalService.canPostForPurposes(
      [paymentPurpose, 'CUSTOMERS'],
      now,
      client,
    );
    if (!canPost) {
      this.logger.warn(
        `Abono de cartera ${payment.id}: propósitos pendientes de mapeo. Se omite asiento.`,
      );
      return null;
    }

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
        entryDate: now.toISOString().slice(0, 10),
        description: `Abono cartera${payment.invoiceNumber ? ' factura ' + payment.invoiceNumber : ''}${payment.customerName ? ' - ' + payment.customerName : ''}`,
        sourceType: 'RECEIVABLE_PAYMENT',
        sourceId: payment.id,
        createdById: payment.createdByUserId ?? undefined,
        lines,
      },
      tx,
    );
  }

  /**
   * Reversa el asiento contable al anular un abono de cliente.
   */
  async handleCustomerPaymentReversed(paymentId: string, reason: string, userId?: string, tx?: Tx) {
    const client = tx ?? prisma;
    const existing = await client.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: 'RECEIVABLE_PAYMENT', sourceId: paymentId } },
    });
    if (!existing || existing.status !== 'POSTED') return null;

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { reversalOfId: existing.id },
    });
    if (alreadyReversed) return alreadyReversed;

    return this.journalService.reverse(
      {
        entryId: existing.id,
        entryDate: new Date().toISOString().slice(0, 10),
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
  async handleSupplierPayment(payment: PayablePaymentEventInput, tx?: Tx) {
    const client = tx ?? prisma;
    const amountCents = parseMoneyToCents(
      new Prisma.Decimal(payment.amount).toFixed(2),
      'Monto del pago a proveedor',
    );
    if (amountCents <= 0n) return null;

    const paymentPurpose: DbPurpose =
      payment.paymentMethod === 'EFECTIVO' ? 'CASH' : 'BANK';

    const now = new Date();
    const canPost = await this.journalService.canPostForPurposes(
      ['SUPPLIERS', paymentPurpose],
      now,
      client,
    );
    if (!canPost) {
      this.logger.warn(
        `Pago a proveedor ${payment.id}: propósitos pendientes de mapeo. Se omite asiento.`,
      );
      return null;
    }

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
        entryDate: now.toISOString().slice(0, 10),
        description: `Pago a proveedor${payment.invoiceNumber ? ' factura ' + payment.invoiceNumber : ''}${payment.supplierName ? ' - ' + payment.supplierName : ''}`,
        sourceType: 'PAYABLE_PAYMENT',
        sourceId: payment.id,
        createdById: payment.createdByUserId ?? undefined,
        lines,
      },
      tx,
    );
  }

  /**
   * Reversa el asiento contable al revertir un pago a proveedor.
   */
  async handleSupplierPaymentReversed(paymentId: string, reason: string, userId?: string, tx?: Tx) {
    const client = tx ?? prisma;
    const existing = await client.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: 'PAYABLE_PAYMENT', sourceId: paymentId } },
    });
    if (!existing || existing.status !== 'POSTED') return null;

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { reversalOfId: existing.id },
    });
    if (alreadyReversed) return alreadyReversed;

    return this.journalService.reverse(
      {
        entryId: existing.id,
        entryDate: new Date().toISOString().slice(0, 10),
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
  async handleExpenseCreated(expense: ExpenseEventInput, tx?: Tx) {
    const date = new Date(expense.expenseDate);
    const amountCents = parseMoneyToCents(expense.amount.toString(), 'Monto de gasto');
    if (amountCents <= 0n) return null;
    const amountStr = centsToMoneyString(amountCents);

    const isPaid = expense.status === 'PAGADO';
    const isBank = expense.paymentMethod === 'TRANSFERENCIA';
    const contraPurpose = isPaid
      ? isBank
        ? DbPurpose.BANK
        : DbPurpose.CASH
      : DbPurpose.SUPPLIERS;

    // Verificar si se puede postear con la contrapartida requerida
    const canPost = await this.journalService.canPostForPurposes([contraPurpose], date, tx);
    if (!canPost) {
      this.logger.warn(
        `[Contabilidad Automática] Asiento de gasto omitido por falta de mapeo contable activo para ${contraPurpose}.`,
      );
      return null;
    }

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
        lines,
      },
      tx,
    );
  }

  /**
   * Reversa el asiento contable de un gasto cancelado / anulado.
   */
  async handleExpenseCancelled(expenseId: string, reason: string, userId?: string, tx?: Tx) {
    const client = tx ?? prisma;
    const existing = await client.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: 'EXPENSE', sourceId: expenseId } },
    });
    if (!existing || existing.status !== 'POSTED') return null;

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { reversalOfId: existing.id },
    });
    if (alreadyReversed) return alreadyReversed;

    return this.journalService.reverse(
      {
        entryId: existing.id,
        entryDate: new Date().toISOString().slice(0, 10),
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
  async handleExpensePayment(payment: ExpensePaymentEventInput, tx?: Tx) {
    const date = new Date(payment.paymentDate);
    const amountCents = parseMoneyToCents(payment.amount.toString(), 'Monto de pago de gasto');
    if (amountCents <= 0n) return null;
    const amountStr = centsToMoneyString(amountCents);

    const isBank = payment.paymentMethod === 'TRANSFERENCIA';
    const paymentPurpose = isBank ? DbPurpose.BANK : DbPurpose.CASH;

    const canPost = await this.journalService.canPostForPurposes(
      [DbPurpose.SUPPLIERS, paymentPurpose],
      date,
      tx,
    );
    if (!canPost) {
      this.logger.warn(
        `[Contabilidad Automática] Asiento de pago de gasto omitido por falta de mapeo contable activo para SUPPLIERS o ${paymentPurpose}.`,
      );
      return null;
    }

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
        lines,
      },
      tx,
    );
  }

  /**
   * Reversa el asiento contable al revertir un pago de gasto.
   */
  async handleExpensePaymentReversed(paymentId: string, reason: string, userId?: string, tx?: Tx) {
    const client = tx ?? prisma;
    const existing = await client.journalEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: 'EXPENSE_PAYMENT', sourceId: paymentId } },
    });
    if (!existing || existing.status !== 'POSTED') return null;

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { reversalOfId: existing.id },
    });
    if (alreadyReversed) return alreadyReversed;

    return this.journalService.reverse(
      {
        entryId: existing.id,
        entryDate: new Date().toISOString().slice(0, 10),
        reason,
        createdById: userId,
      },
      tx,
    );
  }
}
