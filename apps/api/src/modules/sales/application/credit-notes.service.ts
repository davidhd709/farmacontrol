import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import {
  CreditNoteDto,
  CreditNoteLineDto,
  CreateCreditNotePayload,
} from '@farmacia/contracts';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';
import { AuditService } from '../../audit/application/services/audit.service';
import { IdempotencyService } from '../infrastructure/idempotency.service';
import { parseMoneyToCents, centsToMoneyString } from '../../treasury/domain/treasury-rules';
import { calculateNewCashBalanceCents } from '../../cash/domain/cash-rules';
import { recordSourceBankMovement } from '../../treasury/application/record-source-bank-movement';
import {
  prorateCents,
  resolveRefundMethod,
  sortAllocationsFefo,
  splitReturnAcrossLots,
} from '../domain/credit-note-rules';

function toCents(value: Prisma.Decimal | string | number, label: string): bigint {
  return parseMoneyToCents(new Prisma.Decimal(value).toFixed(2), label);
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

  constructor(
    @Optional() customClient?: PrismaClient,
    @Optional() private readonly accountingEngine?: AccountingEngineService,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly idempotencyService: IdempotencyService = new IdempotencyService(),
  ) {
    this.client = customClient ?? prisma;
  }

  async createCreditNote(
    saleId: string,
    payload: CreateCreditNotePayload,
    userId: string,
    idempotencyKey?: string,
  ): Promise<CreditNoteDto> {
    const key = idempotencyKey?.trim();
    if (!key) {
      throw new BadRequestException('Idempotency-Key es obligatorio para emitir una nota crédito.');
    }
    if (key.length > 100) {
      throw new BadRequestException('Idempotency-Key debe tener entre 1 y 100 caracteres.');
    }
    const endpoint = `/api/v1/sales/${saleId}/credit-notes`;
    const requestHash = this.idempotencyService.computeHash(endpoint, userId, payload);

    if (!payload.items || payload.items.length === 0) {
      throw new BadRequestException('La nota crédito debe incluir al menos una línea a devolver.');
    }
    const lineIds = payload.items.map((item) => item.saleLineId);
    if (new Set(lineIds).size !== lineIds.length) {
      throw new BadRequestException('Cada línea de venta debe aparecer una sola vez en la nota crédito.');
    }

    return executeWithRetry(async () => {
      return this.client.$transaction(
        async (tx) => {
          // Serializa con la anulación y con otras notas crédito de la misma venta
          await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId}::uuid FOR UPDATE`;

          // Un reintento con la misma clave devuelve la nota ya emitida sin repetir efectos
          const cached = await this.idempotencyService.getRecord(key, requestHash, tx);
          if (cached) {
            return cached.responseBody as CreditNoteDto;
          }

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

          const refundMethod = resolveRefundMethod(sale.paymentMethod, payload.refundMethod);
          if (!refundMethod) {
            throw new BadRequestException(
              `Medio de reembolso no soportado: '${payload.refundMethod}'. Use EFECTIVO, TRANSFERENCIA o CREDITO_CARTERA.`,
            );
          }
          if (refundMethod === 'TRANSFERENCIA' && !sale.bankAccountId) {
            throw new BadRequestException(
              'La devolución por transferencia solo aplica a ventas pagadas por transferencia.',
            );
          }
          if (refundMethod === 'CREDITO_CARTERA' && sale.paymentMethod !== 'CREDITO') {
            throw new BadRequestException(
              'La devolución a cartera solo aplica a ventas a crédito.',
            );
          }

          // 2. Consecutivo de Nota Crédito: referencia de kardex, caja y banco
          const count = await tx.creditNote.count();
          const creditNoteNumber = `NC-${String(count + 1).padStart(6, '0')}`;
          const shouldRestock = payload.restock !== false;

          // 3. Validar cantidades y calcular montos por línea y por lote
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

          for (const item of payload.items) {
            const line = sale.lines.find((l) => l.id === item.saleLineId);
            if (!line) {
              throw new BadRequestException(
                `Línea de venta '${item.saleLineId}' no pertenece a la venta ${sale.invoiceNumber}.`,
              );
            }

            if (!(item.quantityCommercial > 0)) {
              throw new BadRequestException(
                `La cantidad a devolver debe ser mayor a cero para el producto ${line.product.name}.`,
              );
            }

            const factor = line.presentationFactorHistorical || 1;
            const quantityBaseUnits = Math.round(item.quantityCommercial * factor);
            if (Math.abs(item.quantityCommercial * factor - quantityBaseUnits) > 1e-6) {
              throw new BadRequestException(
                `La cantidad a devolver de ${line.product.name} debe equivaler a unidades base enteras.`,
              );
            }

            // Lo ya acreditado se mide en unidades base y centavos, sin redondeos acumulados
            let creditedBaseUnits = 0;
            let creditedSubtotalCents = 0n;
            let creditedTaxCents = 0n;
            for (const cn of sale.creditNotes) {
              for (const cnl of cn.lines) {
                if (cnl.saleLineId === line.id) {
                  creditedBaseUnits += cnl.quantityBaseUnits;
                  creditedSubtotalCents += toCents(cnl.subtotal, 'Subtotal acreditado');
                  creditedTaxCents += toCents(cnl.taxAmount, 'IVA acreditado');
                }
              }
            }

            const remainingBaseUnits = line.quantityBaseUnits - creditedBaseUnits;
            if (quantityBaseUnits > remainingBaseUnits) {
              throw new BadRequestException(
                `Cantidad a devolver (${item.quantityCommercial}) excede el saldo disponible (${remainingBaseUnits / factor}) para ${line.product.name}.`,
              );
            }

            // Prorrateo sobre los valores ya netos de descuento; la última devolución toma el resto exacto
            const lineSubtotalCents = toCents(line.subtotal, 'Subtotal línea');
            const lineTaxCents = toCents(line.taxAmount, 'IVA línea');
            const isLastReturn = quantityBaseUnits === remainingBaseUnits;
            const returnSubtotalCents = isLastReturn
              ? lineSubtotalCents - creditedSubtotalCents
              : prorateCents(lineSubtotalCents, quantityBaseUnits, line.quantityBaseUnits);
            const returnTaxCents = isLastReturn
              ? lineTaxCents - creditedTaxCents
              : prorateCents(lineTaxCents, quantityBaseUnits, line.quantityBaseUnits);

            totalSubtotalCents += returnSubtotalCents;
            totalTaxCents += returnTaxCents;

            // Costo con que se vendió; las ventas anteriores a su registro usan el costo vigente
            const unitCostCents = toCents(line.unitCostBase ?? line.product.baseCost, 'Costo base');
            totalCostCents += BigInt(quantityBaseUnits) * unitCostCents;

            const portions = splitReturnAcrossLots(
              sortAllocationsFefo(line.lotAllocations),
              creditedBaseUnits,
              quantityBaseUnits,
            );

            let assignedSubtotalCents = 0n;
            let assignedTaxCents = 0n;
            portions.forEach((portion, index) => {
              const isLastPortion = index === portions.length - 1;
              const subtotalCents = isLastPortion
                ? returnSubtotalCents - assignedSubtotalCents
                : prorateCents(returnSubtotalCents, portion.quantityBaseUnits, quantityBaseUnits);
              const taxCents = isLastPortion
                ? returnTaxCents - assignedTaxCents
                : prorateCents(returnTaxCents, portion.quantityBaseUnits, quantityBaseUnits);
              assignedSubtotalCents += subtotalCents;
              assignedTaxCents += taxCents;

              creditLinesData.push({
                saleLineId: line.id,
                productId: line.productId,
                lotId: portion.lotId,
                quantityCommercial: new Prisma.Decimal(portion.quantityBaseUnits)
                  .div(factor)
                  .toDecimalPlaces(2),
                quantityBaseUnits: portion.quantityBaseUnits,
                unitPrice: new Prisma.Decimal(line.unitPrice),
                subtotal: new Prisma.Decimal(centsToMoneyString(subtotalCents)),
                taxRate: new Prisma.Decimal(line.taxRate),
                taxAmount: new Prisma.Decimal(centsToMoneyString(taxCents)),
                total: new Prisma.Decimal(centsToMoneyString(subtotalCents + taxCents)),
              });
            });

            // 4. Reintegro a cada lote de origen si restock === true
            if (shouldRestock) {
              for (const portion of portions) {
                if (!portion.lotId) continue;
                await tx.$queryRaw`SELECT id FROM inventory_lots WHERE id = ${portion.lotId}::uuid FOR UPDATE`;
                const updatedLot = await tx.inventoryLot.update({
                  where: { id: portion.lotId },
                  data: {
                    currentQuantity: { increment: portion.quantityBaseUnits },
                  },
                });

                await tx.inventoryMovement.create({
                  data: {
                    movementType: 'ENTRADA_DEVOLUCION_VENTA',
                    productId: line.productId,
                    lotId: portion.lotId,
                    presentationId: line.presentationId || null,
                    quantityBaseUnits: portion.quantityBaseUnits,
                    presentationFactorHistorical: line.presentationFactorHistorical,
                    balanceAfterBaseUnits: updatedLot.currentQuantity,
                    referenceDocumentType: 'CREDIT_NOTE',
                    referenceDocumentId: creditNoteNumber,
                    notes: `Reintegro por devolución en venta ${sale.invoiceNumber} (${payload.reason})`,
                    createdByUserId: userId,
                  },
                });
              }
            }
          }

          const totalReturnCents = totalSubtotalCents + totalTaxCents;

          // 5. Ajuste financiero según método de reembolso
          if (refundMethod === 'CREDITO_CARTERA') {
            const receivables = await tx.$queryRaw<
              Array<{
                id: string;
                total_amount: Prisma.Decimal;
                balance: Prisma.Decimal;
                status: string;
                notes: string | null;
              }>
            >`
              SELECT id, total_amount, balance, status, notes
              FROM receivables
              WHERE sale_id = ${sale.id}::uuid
              FOR UPDATE
            `;
            if (!receivables.length) {
              throw new BadRequestException(
                `La venta ${sale.invoiceNumber} no tiene cuenta por cobrar asociada.`,
              );
            }
            const receivable = receivables[0];
            if (receivable.status === 'CANCELADA') {
              throw new ConflictException(
                `La cuenta por cobrar de la venta ${sale.invoiceNumber} está CANCELADA.`,
              );
            }
            const balanceCents = toCents(receivable.balance, 'Saldo de cartera');
            if (totalReturnCents > balanceCents) {
              throw new ConflictException(
                `La devolución (${centsToMoneyString(totalReturnCents)}) supera el saldo pendiente en cartera (${centsToMoneyString(balanceCents)}).`,
              );
            }
            // Se reduce lo adeudado: total y saldo bajan juntos y lo abonado no cambia
            const newTotalCents = toCents(receivable.total_amount, 'Total de cartera') - totalReturnCents;
            const newBalanceCents = balanceCents - totalReturnCents;
            await tx.receivable.update({
              where: { id: receivable.id },
              data: {
                totalAmount: new Prisma.Decimal(centsToMoneyString(newTotalCents)),
                balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
                status: newBalanceCents === 0n ? 'PAGADA' : receivable.status,
                notes: `${receivable.notes || ''} [Nota Crédito ${creditNoteNumber}: -${centsToMoneyString(totalReturnCents)}]`.trim(),
              },
            });
          } else if (refundMethod === 'TRANSFERENCIA') {
            await recordSourceBankMovement(tx, {
              bankAccountId: sale.bankAccountId!,
              movementType: 'WITHDRAWAL',
              amount: centsToMoneyString(totalReturnCents),
              concept: `Reembolso por Nota Crédito ${creditNoteNumber} de venta ${sale.invoiceNumber}`,
              referenceDocumentType: 'CREDIT_NOTE',
              referenceDocumentId: creditNoteNumber,
              createdById: userId,
            });
          } else {
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
              restock: shouldRestock,
              createdById: userId,
              lines: {
                create: creditLinesData,
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
                bankAccountId: creditNote.refundMethod === 'TRANSFERENCIA' ? sale.bankAccountId : null,
                restock: creditNote.restock,
                costTotal: centsToMoneyString(totalCostCents),
                createdById: userId,
                createdAt: creditNote.createdAt,
              },
              tx,
            );
          }

          const dto = this.mapToDto(creditNote);
          await this.idempotencyService.saveRecord(
            {
              key,
              userId,
              endpoint,
              requestHash,
              responseStatus: 201,
              responseBody: dto,
            },
            tx,
          );
          return dto;
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
