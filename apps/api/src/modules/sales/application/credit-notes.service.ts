import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import {
  CreditNoteDto,
  CreditNoteLineDto,
  CreateCreditNotePayload,
} from '@farmacia/contracts';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';
import { AuditService } from '../../audit/application/services/audit.service';
import { parseMoneyToCents, centsToMoneyString } from '../../treasury/domain/treasury-rules';
import { calculateNewCashBalanceCents } from '../../cash/domain/cash-rules';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

function isRetryableConcurrencyError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034' || error.code === 'P2002' || error.code === 'P2028') {
      return true;
    }
    if (error.code === 'P2010') {
      const meta = error.meta as { code?: string; message?: string } | undefined;
      const code = meta?.code;
      if (code === '40001' || code === '40P01') {
        return true;
      }
    }
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as Error).message || '').toLowerCase();
    if (
      msg.includes('40001') ||
      msg.includes('40p01') ||
      msg.includes('could not serialize access') ||
      msg.includes('deadlock detected') ||
      msg.includes('write conflict')
    ) {
      return true;
    }
  }
  return false;
}

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 10,
  baseDelayMs = 30,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (isRetryableConcurrencyError(error) && attempt < maxRetries) {
        attempt++;
        const jitter = Math.floor(Math.random() * 50);
        const delay = Math.min(baseDelayMs * Math.pow(1.5, attempt) + jitter, 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

@Injectable()
export class CreditNotesService {
  private readonly client: PrismaClient;

  constructor(
    @Optional() customClient?: PrismaClient,
    @Optional() private readonly accountingEngine?: AccountingEngineService,
    @Optional() private readonly auditService?: AuditService,
  ) {
    this.client = customClient ?? prisma;
  }

  async createCreditNote(
    saleId: string,
    payload: CreateCreditNotePayload,
    userId: string,
  ): Promise<CreditNoteDto> {
    if (!payload.items || payload.items.length === 0) {
      throw new BadRequestException('La nota crédito debe incluir al menos una línea a devolver.');
    }

    return executeWithRetry(async () => {
      return this.client.$transaction(
        async (tx) => {
          // 1. Obtener venta con sus líneas y lotes asignados
          const sale = await tx.sale.findUnique({
            where: { id: saleId },
            include: {
              customer: true,
              lines: {
                include: {
                  product: true,
                  lotAllocations: {
                    include: { lot: true },
                  },
                },
              },
              creditNotes: {
                include: { lines: true },
              },
            },
          });

          if (!sale) {
            throw new NotFoundException(`Venta con id '${saleId}' no encontrada.`);
          }

          if (sale.status === 'CANCELLED') {
            throw new BadRequestException(
              `La venta ${sale.invoiceNumber} está anulada. No se pueden emitir notas crédito sobre una venta anulada.`,
            );
          }

          // 2. Validar cantidades devueltas por línea
          const creditLinesData: Array<{
            saleLineId: string;
            productId: string;
            lotId: string | null;
            quantityCommercial: number;
            quantityBaseUnits: number;
            unitPrice: Prisma.Decimal;
            subtotal: Prisma.Decimal;
            taxRate: Prisma.Decimal;
            taxAmount: Prisma.Decimal;
            total: Prisma.Decimal;
            costBaseUnit: Prisma.Decimal;
          }> = [];

          let totalSubtotalCents = 0n;
          let totalTaxCents = 0n;
          let totalReturnCents = 0n;
          let totalCostCents = 0n;

          for (const item of payload.items) {
            const line = sale.lines.find((l) => l.id === item.saleLineId);
            if (!line) {
              throw new BadRequestException(
                `Línea de venta '${item.saleLineId}' no pertenece a la venta ${sale.invoiceNumber}.`,
              );
            }

            if (item.quantityCommercial <= 0) {
              throw new BadRequestException(
                `La cantidad a devolver debe ser mayor a cero para el producto ${line.product.name}.`,
              );
            }

            // Sumar cantidades ya acreditadas en notas crédito previas
            let alreadyCredited = 0;
            for (const cn of sale.creditNotes) {
              for (const cnl of cn.lines) {
                if (cnl.saleLineId === line.id) {
                  alreadyCredited += Number(cnl.quantityCommercial);
                }
              }
            }

            const maxAvailable = Number(line.quantityCommercial) - alreadyCredited;
            if (item.quantityCommercial > maxAvailable + 0.0001) {
              throw new BadRequestException(
                `Cantidad a devolver (${item.quantityCommercial}) excede el saldo disponible (${maxAvailable}) para ${line.product.name}.`,
              );
            }

            const factor = line.presentationFactorHistorical || 1;
            const quantityBaseUnits = Math.round(item.quantityCommercial * factor);

            // Seleccionar lote asignado originalmente
            const lotId =
              line.lotAllocations.length > 0 ? line.lotAllocations[0].lotId : null;

            const unitPrice = new Prisma.Decimal(line.unitPrice);
            const lineSubtotal = unitPrice.mul(new Prisma.Decimal(item.quantityCommercial));
            const lineTaxRate = new Prisma.Decimal(line.taxRate);
            const lineTax = lineSubtotal.mul(lineTaxRate).div(100);
            const lineTotal = lineSubtotal.add(lineTax);

            const lineSubCents = parseMoneyToCents(lineSubtotal.toFixed(2), 'Subtotal línea');
            const lineTaxCents = parseMoneyToCents(lineTax.toFixed(2), 'IVA línea');
            const lineTotCents = lineSubCents + lineTaxCents;

            totalSubtotalCents += lineSubCents;
            totalTaxCents += lineTaxCents;
            totalReturnCents += lineTotCents;

            const costPerUnit = new Prisma.Decimal(line.product.baseCost);
            const lineCostCents = BigInt(quantityBaseUnits) * parseMoneyToCents(costPerUnit.toFixed(2), 'Costo base');
            totalCostCents += lineCostCents;

            creditLinesData.push({
              saleLineId: line.id,
              productId: line.productId,
              lotId,
              quantityCommercial: item.quantityCommercial,
              quantityBaseUnits,
              unitPrice,
              subtotal: new Prisma.Decimal(centsToMoneyString(lineSubCents)),
              taxRate: lineTaxRate,
              taxAmount: new Prisma.Decimal(centsToMoneyString(lineTaxCents)),
              total: new Prisma.Decimal(centsToMoneyString(lineTotCents)),
              costBaseUnit: costPerUnit,
            });

            // 3. Reintegro a Inventario si restock === true
            const shouldRestock = payload.restock !== false;
            if (shouldRestock && lotId) {
              const updatedLot = await tx.inventoryLot.update({
                where: { id: lotId },
                data: {
                  currentQuantity: { increment: quantityBaseUnits },
                },
              });

              await tx.inventoryMovement.create({
                data: {
                  movementType: 'ENTRADA_DEVOLUCION_VENTA',
                  productId: line.productId,
                  lotId,
                  presentationId: line.presentationId || null,
                  quantityBaseUnits,
                  presentationFactorHistorical: line.presentationFactorHistorical,
                  balanceAfterBaseUnits: updatedLot.currentQuantity,
                  referenceDocumentType: 'CREDIT_NOTE',
                  referenceDocumentId: sale.invoiceNumber,
                  notes: `Reintegro por devolución en venta ${sale.invoiceNumber} (${payload.reason})`,
                  createdByUserId: userId,
                },
              });
            }
          }

          // 4. Consecutivo de Nota Crédito
          const count = await tx.creditNote.count();
          const creditNoteNumber = `NC-${String(count + 1).padStart(6, '0')}`;

          const refundMethod =
            payload.refundMethod ||
            (sale.paymentMethod === 'CREDITO' ? 'CREDITO_CARTERA' : 'EFECTIVO');

          // 5. Ajuste financiero según método de reembolso
          if (refundMethod === 'CREDITO_CARTERA') {
            const receivable = await tx.receivable.findUnique({
              where: { saleId: sale.id },
            });
            if (receivable) {
              const currentBalance = new Prisma.Decimal(receivable.balance);
              const returnAmount = new Prisma.Decimal(centsToMoneyString(totalReturnCents));
              const newBalance = currentBalance.sub(returnAmount);
              const finalBalance = newBalance.lt(0) ? new Prisma.Decimal(0) : newBalance;

              await tx.receivable.update({
                where: { id: receivable.id },
                data: {
                  balance: finalBalance,
                  status: finalBalance.isZero() ? 'PAGADA' : receivable.status,
                  notes: `${receivable.notes || ''} [Nota Crédito ${creditNoteNumber}: -${returnAmount.toFixed(2)}]`.trim(),
                },
              });
            }
          } else if (refundMethod === 'EFECTIVO') {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(742189321)`;

            const lastRows = await tx.$queryRaw<Array<{ balance_after: Prisma.Decimal }>>`
              SELECT balance_after
              FROM cash_movements
              ORDER BY created_at DESC
              LIMIT 1
            `;

            const currentBalanceCents =
              lastRows.length > 0
                ? parseMoneyToCents(lastRows[0].balance_after.toString(), 'Saldo de caja')
                : 0n;

            const { balanceAfter } = calculateNewCashBalanceCents(
              currentBalanceCents,
              'EGRESO_MANUAL',
              totalReturnCents,
            );

            await tx.cashMovement.create({
              data: {
                movementType: 'EGRESO_MANUAL',
                amount: new Prisma.Decimal(centsToMoneyString(totalReturnCents)),
                paymentMethod: 'EFECTIVO',
                reason: `Reembolso por Nota Crédito ${creditNoteNumber} de venta ${sale.invoiceNumber}`,
                referenceDocumentType: 'CREDIT_NOTE',
                referenceDocumentId: creditNoteNumber,
                balanceAfter: new Prisma.Decimal(centsToMoneyString(balanceAfter)),
                createdByUserId: userId,
              },
            });
          }

          // 6. Guardar la Nota Crédito y sus líneas
          const creditNote = await tx.creditNote.create({
            data: {
              creditNoteNumber,
              saleId: sale.id,
              customerId: sale.customerId,
              reason: payload.reason,
              subtotal: new Prisma.Decimal(centsToMoneyString(totalSubtotalCents)),
              taxTotal: new Prisma.Decimal(centsToMoneyString(totalTaxCents)),
              total: new Prisma.Decimal(centsToMoneyString(totalReturnCents)),
              refundMethod,
              restock: payload.restock !== false,
              createdById: userId,
              lines: {
                create: creditLinesData.map((cl) => ({
                  saleLineId: cl.saleLineId,
                  productId: cl.productId,
                  lotId: cl.lotId,
                  quantityCommercial: cl.quantityCommercial,
                  quantityBaseUnits: cl.quantityBaseUnits,
                  unitPrice: cl.unitPrice,
                  subtotal: cl.subtotal,
                  taxRate: cl.taxRate,
                  taxAmount: cl.taxAmount,
                  total: cl.total,
                })),
              },
            },
            include: {
              lines: {
                include: {
                  product: true,
                  lot: true,
                },
              },
              customer: true,
              sale: true,
              createdByUser: {
                select: { id: true, username: true },
              },
            },
          });

          // 7. Generar Asiento Contable Automático (Partida Doble)
          if (this.accountingEngine) {
            await this.accountingEngine.handleCreditNoteConfirmed(
              {
                id: creditNote.id,
                creditNoteNumber: creditNote.creditNoteNumber,
                saleId: sale.id,
                saleInvoiceNumber: sale.invoiceNumber,
                customerId: sale.customerId,
                customerName: sale.customer.name,
                reason: creditNote.reason,
                subtotal: creditNote.subtotal,
                taxTotal: creditNote.taxTotal,
                total: creditNote.total,
                refundMethod: creditNote.refundMethod,
                restock: creditNote.restock,
                costTotal: centsToMoneyString(totalCostCents),
                createdById: userId,
                createdAt: creditNote.createdAt,
              },
              tx,
            );
          }

          return this.mapToDto(creditNote);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    });
  }

  async listCreditNotes(saleId?: string): Promise<CreditNoteDto[]> {
    const where: Prisma.CreditNoteWhereInput = {};
    if (saleId) where.saleId = saleId;

    const notes = await this.client.creditNote.findMany({
      where,
      include: {
        customer: true,
        sale: true,
        createdByUser: { select: { id: true, username: true } },
        lines: {
          include: { product: true, lot: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return notes.map((n) => this.mapToDto(n));
  }

  async getCreditNoteById(id: string): Promise<CreditNoteDto> {
    const note = await this.client.creditNote.findUnique({
      where: { id },
      include: {
        customer: true,
        sale: true,
        createdByUser: { select: { id: true, username: true } },
        lines: {
          include: { product: true, lot: true },
        },
      },
    });

    if (!note) {
      throw new NotFoundException(`Nota Crédito con id '${id}' no encontrada.`);
    }

    return this.mapToDto(note);
  }

  private mapToDto(raw: any): CreditNoteDto {
    return {
      id: raw.id,
      creditNoteNumber: raw.creditNoteNumber,
      saleId: raw.saleId,
      saleInvoiceNumber: raw.sale?.invoiceNumber,
      customerId: raw.customerId,
      customerName: raw.customer?.name,
      customerDocument: raw.customer?.documentNumber,
      reason: raw.reason,
      subtotal: Number(raw.subtotal),
      taxTotal: Number(raw.taxTotal),
      total: Number(raw.total),
      refundMethod: raw.refundMethod,
      restock: raw.restock,
      createdById: raw.createdById,
      createdByName: raw.createdByUser?.username,
      createdAt: raw.createdAt.toISOString(),
      lines: (raw.lines || []).map((l: any): CreditNoteLineDto => ({
        id: l.id,
        creditNoteId: l.creditNoteId,
        saleLineId: l.saleLineId,
        productId: l.productId,
        productCode: l.product?.code,
        productName: l.product?.name,
        lotId: l.lotId,
        lotNumber: l.lot?.lotNumber,
        quantityCommercial: Number(l.quantityCommercial),
        quantityBaseUnits: l.quantityBaseUnits,
        unitPrice: Number(l.unitPrice),
        subtotal: Number(l.subtotal),
        taxRate: Number(l.taxRate),
        taxAmount: Number(l.taxAmount),
        total: Number(l.total),
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }
}
