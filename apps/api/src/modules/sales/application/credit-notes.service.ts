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
import { recordSourceBankMovement } from '../../treasury/application/record-source-bank-movement';
import { IdempotencyService } from '../infrastructure/idempotency.service';
import {
  creditAmountsForLine,
  splitProportionally,
  splitReturnAcrossLots,
} from '../domain/credit-note-rules';
import { quantityToHundredths, SaleMoneyError } from '../domain/sale-money';

const CREDIT_NOTE_ENDPOINT = 'POST /api/v1/sales/credit-notes';

type CreditNoteRefundMethod = NonNullable<CreateCreditNotePayload['refundMethod']>;
/** SALDO_A_FAVOR no tiene contrapartida (saldo del cliente) implementada todavía. */
const REFUND_METHODS: CreditNoteRefundMethod[] = ['EFECTIVO', 'TRANSFERENCIA', 'CREDITO_CARTERA'];

function moneyCents(value: Prisma.Decimal | string | number, name: string): bigint {
  return parseMoneyToCents(new Prisma.Decimal(value).toFixed(2), name);
}

function toHundredths(value: number, productName: string): bigint {
  try {
    return quantityToHundredths(value, `La cantidad de ${productName}`);
  } catch (error) {
    if (error instanceof SaleMoneyError) throw new BadRequestException(error.message);
    throw error;
  }
}

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

  private readonly idempotencyService: IdempotencyService;

  constructor(
    @Optional() customClient?: PrismaClient,
    @Optional() private readonly accountingEngine?: AccountingEngineService,
    @Optional() private readonly auditService?: AuditService,
    @Optional() idempotencyService?: IdempotencyService,
  ) {
    this.client = customClient ?? prisma;
    this.idempotencyService = idempotencyService ?? new IdempotencyService(this.client);
  }

  async createCreditNote(
    saleId: string,
    payload: CreateCreditNotePayload,
    userId: string,
    idempotencyKey?: string,
  ): Promise<CreditNoteDto> {
    if (!payload.items || payload.items.length === 0) {
      throw new BadRequestException('La nota crédito debe incluir al menos una línea a devolver.');
    }
    // AUD-007: una nota crédito mueve dinero e inventario; un reintento no la duplica
    const key = idempotencyKey?.trim();
    if (!key || key.length > 100) {
      throw new BadRequestException(
        'Idempotency-Key es obligatorio (máximo 100 caracteres) para registrar una nota crédito.',
      );
    }
    const endpoint = `${CREDIT_NOTE_ENDPOINT}:${saleId}`;
    const requestHash = this.idempotencyService.computeHash(endpoint, userId, payload);

    const { dto, replayed } = await executeWithRetry(async () => {
      return this.client.$transaction(
        async (tx) => {
          const cached = await this.idempotencyService.getRecord(key, requestHash, tx);
          if (cached) {
            return { dto: cached.responseBody as CreditNoteDto, replayed: true };
          }

          // 1. Bloquear la venta: serializa notas crédito y anulaciones concurrentes
          const lockedSales = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM sales WHERE id = ${saleId}::uuid FOR UPDATE
          `;
          if (!lockedSales.length) {
            throw new NotFoundException(`Venta con id '${saleId}' no encontrada.`);
          }

          const sale = await tx.sale.findUniqueOrThrow({
            where: { id: saleId },
            include: {
              customer: true,
              lines: {
                include: {
                  product: true,
                  lotAllocations: { orderBy: { createdAt: 'asc' } },
                },
              },
              creditNotes: { include: { lines: true } },
            },
          });

          if (sale.status === 'CANCELLED') {
            throw new BadRequestException(
              `La venta ${sale.invoiceNumber} está anulada. No se pueden emitir notas crédito sobre una venta anulada.`,
            );
          }

          // 2. Forma de reembolso
          const refundMethod: CreditNoteRefundMethod =
            payload.refundMethod ??
            (sale.paymentMethod === 'CREDITO' ? 'CREDITO_CARTERA' : 'EFECTIVO');
          if (!REFUND_METHODS.includes(refundMethod)) {
            throw new BadRequestException(
              `La forma de reembolso '${refundMethod}' no está disponible. Use: ${REFUND_METHODS.join(', ')}.`,
            );
          }
          if (refundMethod === 'CREDITO_CARTERA' && sale.paymentMethod !== 'CREDITO') {
            throw new BadRequestException(
              'El abono a cartera solo aplica a ventas a crédito.',
            );
          }
          const refundBankAccountId =
            refundMethod === 'TRANSFERENCIA'
              ? (payload.bankAccountId ?? sale.bankAccountId ?? null)
              : null;
          if (refundMethod === 'TRANSFERENCIA' && !refundBankAccountId) {
            throw new BadRequestException(
              'Indique la cuenta bancaria desde la que se transfiere el reembolso.',
            );
          }
          const restock = payload.restock !== false;

          // 3. Consecutivo (la restricción única y el reintento cubren la concurrencia)
          const count = await tx.creditNote.count();
          const creditNoteNumber = `NC-${String(count + 1).padStart(6, '0')}`;

          // 4. Líneas: montos proporcionales al neto vendido, lotes originales y costo histórico
          const creditLinesData: Array<{
            saleLineId: string;
            productId: string;
            lotId: string | null;
            quantityCommercial: Prisma.Decimal;
            quantityBaseUnits: number;
            unitPrice: Prisma.Decimal;
            subtotal: Prisma.Decimal;
            taxRate: Prisma.Decimal;
            taxAmount: Prisma.Decimal;
            total: Prisma.Decimal;
          }> = [];

          let totalSubtotalCents = 0n;
          let totalTaxCents = 0n;
          let totalCostCents = 0n;
          const priorLines = sale.creditNotes.flatMap((cn) => cn.lines);
          const seenLines = new Set<string>();

          for (const item of payload.items) {
            if (seenLines.has(item.saleLineId)) {
              throw new BadRequestException(
                `La línea de venta '${item.saleLineId}' aparece más de una vez en la nota crédito.`,
              );
            }
            seenLines.add(item.saleLineId);

            const line = sale.lines.find((l) => l.id === item.saleLineId);
            if (!line) {
              throw new BadRequestException(
                `Línea de venta '${item.saleLineId}' no pertenece a la venta ${sale.invoiceNumber}.`,
              );
            }

            const returnedH = toHundredths(item.quantityCommercial, line.product.name);
            if (returnedH <= 0n) {
              throw new BadRequestException(
                `La cantidad a devolver debe ser mayor a cero para el producto ${line.product.name}.`,
              );
            }
            const soldH = toHundredths(Number(line.quantityCommercial), line.product.name);
            const linePrior = priorLines.filter((cnl) => cnl.saleLineId === line.id);
            const prevH = linePrior.reduce(
              (acc, cnl) => acc + toHundredths(Number(cnl.quantityCommercial), line.product.name),
              0n,
            );
            if (prevH + returnedH > soldH) {
              throw new BadRequestException(
                `Cantidad a devolver (${item.quantityCommercial}) excede el saldo disponible (${centsToMoneyString(soldH - prevH)}) para ${line.product.name}.`,
              );
            }

            const amounts = creditAmountsForLine({
              soldHundredths: soldH,
              previouslyReturnedHundredths: prevH,
              returnedHundredths: returnedH,
              line: {
                subtotal: moneyCents(line.subtotal, 'Subtotal de la línea'),
                tax: moneyCents(line.taxAmount, 'IVA de la línea'),
              },
              previouslyCredited: {
                subtotal: linePrior.reduce((a, c) => a + moneyCents(c.subtotal, 'Subtotal NC'), 0n),
                tax: linePrior.reduce((a, c) => a + moneyCents(c.taxAmount, 'IVA NC'), 0n),
              },
            });

            const factor = line.presentationFactorHistorical || 1;
            const prevBase = linePrior.reduce((acc, cnl) => acc + cnl.quantityBaseUnits, 0);
            const completesLine = prevH + returnedH === soldH;
            const baseUnits = completesLine
              ? line.quantityBaseUnits - prevBase
              : Math.round((Number(returnedH) / 100) * factor);

            // Costo histórico de la venta; ventas anteriores al registro del costo usan el actual
            const unitCostCents = moneyCents(
              line.unitCost ?? line.product.baseCost,
              'Costo unitario',
            );
            totalCostCents += BigInt(baseUnits) * unitCostCents;

            // Reparto entre los lotes de los que salió la venta
            let portions: Array<{ lotId: string | null; baseUnits: number }>;
            if (line.lotAllocations.length > 0) {
              try {
                portions = splitReturnAcrossLots(
                  baseUnits,
                  line.lotAllocations.map((a) => ({
                    lotId: a.lotId,
                    availableBaseUnits:
                      a.quantityBaseUnits -
                      linePrior
                        .filter((cnl) => cnl.lotId === a.lotId)
                        .reduce((acc, cnl) => acc + cnl.quantityBaseUnits, 0),
                  })),
                );
              } catch (error) {
                throw new BadRequestException((error as Error).message);
              }
            } else {
              portions = [{ lotId: null, baseUnits }];
            }

            const weights = portions.map((p) => BigInt(p.baseUnits));
            const subParts = splitProportionally(amounts.subtotal, weights);
            const taxParts = splitProportionally(amounts.tax, weights);
            const qtyParts = splitProportionally(returnedH, weights);

            for (let k = 0; k < portions.length; k++) {
              const portion = portions[k];
              creditLinesData.push({
                saleLineId: line.id,
                productId: line.productId,
                lotId: portion.lotId,
                quantityCommercial: new Prisma.Decimal(centsToMoneyString(qtyParts[k])),
                quantityBaseUnits: portion.baseUnits,
                unitPrice: new Prisma.Decimal(line.unitPrice),
                subtotal: new Prisma.Decimal(centsToMoneyString(subParts[k])),
                taxRate: new Prisma.Decimal(line.taxRate),
                taxAmount: new Prisma.Decimal(centsToMoneyString(taxParts[k])),
                total: new Prisma.Decimal(centsToMoneyString(subParts[k] + taxParts[k])),
              });

              if (restock && portion.lotId) {
                await tx.$queryRaw`
                  SELECT id FROM inventory_lots WHERE id = ${portion.lotId}::uuid FOR UPDATE
                `;
                const updatedLot = await tx.inventoryLot.update({
                  where: { id: portion.lotId },
                  data: { currentQuantity: { increment: portion.baseUnits } },
                });
                await tx.inventoryMovement.create({
                  data: {
                    movementType: 'ENTRADA_DEVOLUCION_VENTA',
                    productId: line.productId,
                    lotId: portion.lotId,
                    presentationId: line.presentationId || null,
                    quantityBaseUnits: portion.baseUnits,
                    presentationFactorHistorical: line.presentationFactorHistorical,
                    balanceAfterBaseUnits: updatedLot.currentQuantity,
                    referenceDocumentType: 'CREDIT_NOTE',
                    referenceDocumentId: creditNoteNumber,
                    notes: `Reintegro por ${creditNoteNumber} de la venta ${sale.invoiceNumber} (${payload.reason})`,
                    createdByUserId: userId,
                  },
                });
              }
            }

            totalSubtotalCents += amounts.subtotal;
            totalTaxCents += amounts.tax;
          }

          const totalReturnCents = totalSubtotalCents + totalTaxCents;
          if (totalReturnCents <= 0n) {
            throw new BadRequestException('La nota crédito no tiene valor a devolver.');
          }
          const totalReturnStr = centsToMoneyString(totalReturnCents);

          // 5. Ajuste financiero según la forma de reembolso
          if (refundMethod === 'CREDITO_CARTERA') {
            const rows = await tx.$queryRaw<
              Array<{
                id: string;
                total_amount: Prisma.Decimal;
                amount_paid: Prisma.Decimal;
                status: string;
                notes: string | null;
              }>
            >`
              SELECT id, total_amount, amount_paid, status, notes
              FROM receivables
              WHERE sale_id = ${sale.id}::uuid
              FOR UPDATE
            `;
            if (!rows.length) {
              throw new BadRequestException(
                `La venta ${sale.invoiceNumber} no tiene cuenta por cobrar para abonar la devolución.`,
              );
            }
            const receivable = rows[0];
            const newTotalCents =
              moneyCents(receivable.total_amount, 'Total CxC') - totalReturnCents;
            const paidCents = moneyCents(receivable.amount_paid, 'Abonado CxC');
            const newBalanceCents = newTotalCents - paidCents;
            if (newBalanceCents < 0n) {
              throw new BadRequestException(
                `La devolución (${totalReturnStr}) supera lo que el cliente aún debe en la factura ${sale.invoiceNumber}. Reembolse la diferencia en efectivo o transferencia, o reverse primero los abonos.`,
              );
            }
            await tx.receivable.update({
              where: { id: receivable.id },
              data: {
                totalAmount: new Prisma.Decimal(centsToMoneyString(newTotalCents)),
                balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
                status: newBalanceCents === 0n ? 'PAGADA' : receivable.status,
                notes: `${receivable.notes || ''} [Nota Crédito ${creditNoteNumber}: -${totalReturnStr}]`.trim(),
              },
            });
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
                amount: new Prisma.Decimal(totalReturnStr),
                paymentMethod: 'EFECTIVO',
                reason: `Reembolso por Nota Crédito ${creditNoteNumber} de venta ${sale.invoiceNumber}`,
                referenceDocumentType: 'CREDIT_NOTE',
                referenceDocumentId: creditNoteNumber,
                balanceAfter: new Prisma.Decimal(centsToMoneyString(balanceAfter)),
                createdByUserId: userId,
              },
            });
          } else {
            await recordSourceBankMovement(tx, {
              bankAccountId: refundBankAccountId!,
              movementType: 'WITHDRAWAL',
              amount: totalReturnStr,
              concept: `Reembolso por Nota Crédito ${creditNoteNumber} de venta ${sale.invoiceNumber}`,
              referenceDocumentType: 'CREDIT_NOTE',
              referenceDocumentId: creditNoteNumber,
              createdById: userId,
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
              total: new Prisma.Decimal(totalReturnStr),
              refundMethod,
              restock,
              createdById: userId,
              lines: { create: creditLinesData },
            },
            include: {
              lines: { include: { product: true, lot: true } },
              customer: true,
              sale: true,
              createdByUser: { select: { id: true, username: true } },
            },
          });

          // 7. Asiento contable automático con el costo histórico revertido
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

          const result = this.mapToDto(creditNote);
          await this.idempotencyService.saveRecord(
            {
              key,
              userId,
              endpoint,
              requestHash,
              responseStatus: 201,
              responseBody: result,
              ttlHours: 24,
            },
            tx,
          );
          return { dto: result, replayed: false };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    });

    if (!replayed && this.auditService) {
      await this.auditService.recordEvent({
        action: 'sales:credit_note_created',
        entity: 'CreditNote',
        entityId: dto.id,
        userId,
        details: {
          creditNoteNumber: dto.creditNoteNumber,
          saleId,
          total: dto.total,
          refundMethod: dto.refundMethod,
          restock: dto.restock,
        },
      });
    }

    return dto;
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
