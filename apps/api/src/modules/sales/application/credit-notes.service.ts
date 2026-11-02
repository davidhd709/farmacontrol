import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import {
  CancelCreditNotePayload,
  CreditNoteDto,
  CreditNoteLineDto,
  CreateCreditNotePayload,
} from '@farmacia/contracts';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';
import { AuditService } from '../../audit/application/services/audit.service';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { parseMoneyToCents, centsToMoneyString } from '../../treasury/domain/treasury-rules';
import { CashService } from '../../cash/application/cash.service';
import { ReceivablesLedger } from '../../receivables/application/receivables-ledger';
import { InventoryLedger } from '../../inventory/application/inventory-ledger';
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
    private readonly cashService: CashService,
    private readonly receivablesLedger: ReceivablesLedger,
    private readonly inventoryLedger: InventoryLedger,
    private readonly accountingEngine: AccountingEngineService,
    @Optional() customClient?: PrismaClient,
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
      throw new BadRequestException(
        'Cada línea de venta debe aparecer una sola vez en la nota crédito.',
      );
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
              // Una nota anulada ya devolvió lo acreditado: no cuenta para el saldo por devolver
              creditNotes: {
                where: { status: 'CONFIRMADA' },
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
            incRate: Prisma.Decimal;
            incAmount: Prisma.Decimal;
            total: Prisma.Decimal;
          }> = [];

          let totalSubtotalCents = 0n;
          let totalTaxCents = 0n;
          let totalIncCents = 0n;
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
            let creditedIncCents = 0n;
            for (const cn of sale.creditNotes) {
              for (const cnl of cn.lines) {
                if (cnl.saleLineId === line.id) {
                  creditedBaseUnits += cnl.quantityBaseUnits;
                  creditedSubtotalCents += toCents(cnl.subtotal, 'Subtotal acreditado');
                  creditedTaxCents += toCents(cnl.taxAmount, 'IVA acreditado');
                  creditedIncCents += toCents(cnl.incAmount, 'INC acreditado');
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
            // F8: el INC se devuelve en la misma proporción que el IVA
            const lineIncCents = toCents(line.incAmount, 'INC línea');
            const returnIncCents = isLastReturn
              ? lineIncCents - creditedIncCents
              : prorateCents(lineIncCents, quantityBaseUnits, line.quantityBaseUnits);

            totalSubtotalCents += returnSubtotalCents;
            totalTaxCents += returnTaxCents;
            totalIncCents += returnIncCents;

            // Costo con que salió la línea (ADR-005), repartido por unidades de forma acumulada:
            // la última devolución se lleva el resto exacto. Las ventas anteriores al submayor
            // usan el costo por unidad guardado en la línea o el del catálogo, como su asiento.
            const lineCostCents =
              line.costValue !== null
                ? toCents(line.costValue, 'Costo de la línea')
                : toCents(line.unitCostBase ?? line.product.baseCost, 'Costo base') *
                  BigInt(line.quantityBaseUnits);
            const costBeforeCents = prorateCents(
              lineCostCents,
              creditedBaseUnits,
              line.quantityBaseUnits,
            );
            const returnCostCents =
              (isLastReturn
                ? lineCostCents
                : prorateCents(
                    lineCostCents,
                    creditedBaseUnits + quantityBaseUnits,
                    line.quantityBaseUnits,
                  )) - costBeforeCents;

            const portions = splitReturnAcrossLots(
              sortAllocationsFefo(line.lotAllocations),
              creditedBaseUnits,
              quantityBaseUnits,
            );

            let assignedSubtotalCents = 0n;
            let assignedTaxCents = 0n;
            let assignedIncCents = 0n;
            portions.forEach((portion, index) => {
              const isLastPortion = index === portions.length - 1;
              const subtotalCents = isLastPortion
                ? returnSubtotalCents - assignedSubtotalCents
                : prorateCents(returnSubtotalCents, portion.quantityBaseUnits, quantityBaseUnits);
              const taxCents = isLastPortion
                ? returnTaxCents - assignedTaxCents
                : prorateCents(returnTaxCents, portion.quantityBaseUnits, quantityBaseUnits);
              const incCents = isLastPortion
                ? returnIncCents - assignedIncCents
                : prorateCents(returnIncCents, portion.quantityBaseUnits, quantityBaseUnits);
              assignedSubtotalCents += subtotalCents;
              assignedTaxCents += taxCents;
              assignedIncCents += incCents;

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
                incRate: new Prisma.Decimal(line.incRate),
                incAmount: new Prisma.Decimal(centsToMoneyString(incCents)),
                total: new Prisma.Decimal(centsToMoneyString(subtotalCents + taxCents + incCents)),
              });
            });

            // 4. Reintegro a cada lote de origen si restock === true
            if (shouldRestock) {
              let restockedBaseUnits = 0;
              for (const portion of portions) {
                if (!portion.lotId) continue;
                await this.inventoryLedger.changeLotQuantity(
                  tx,
                  portion.lotId,
                  portion.quantityBaseUnits,
                  {
                    movementType: 'ENTRADA_DEVOLUCION_VENTA',
                    productId: line.productId,
                    presentationId: line.presentationId || null,
                    quantityBaseUnits: portion.quantityBaseUnits,
                    presentationFactorHistorical: line.presentationFactorHistorical,
                    referenceDocumentType: 'CREDIT_NOTE',
                    referenceDocumentId: creditNoteNumber,
                    notes: `Reintegro por devolución en venta ${sale.invoiceNumber} (${payload.reason})`,
                    createdByUserId: userId,
                  },
                );
                restockedBaseUnits += portion.quantityBaseUnits;
              }
              if (restockedBaseUnits > 0) {
                const restockCostCents =
                  restockedBaseUnits === quantityBaseUnits
                    ? returnCostCents
                    : prorateCents(returnCostCents, restockedBaseUnits, quantityBaseUnits);
                await this.inventoryLedger.valuation.receive(tx, {
                  productId: line.productId,
                  quantityBaseUnits: restockedBaseUnits,
                  valueCents: restockCostCents,
                  movementType: 'SALE_RETURN',
                  sourceType: 'CREDIT_NOTE',
                  sourceId: creditNoteNumber,
                  userId,
                  // Reingresa a las mismas existencias de las que salió la venta
                  lots: portions.flatMap((portion) =>
                    portion.lotId
                      ? [{ lotId: portion.lotId, quantityBaseUnits: portion.quantityBaseUnits }]
                      : [],
                  ),
                });
                totalCostCents += restockCostCents;
              }
            }
          }

          const totalReturnCents = totalSubtotalCents + totalTaxCents + totalIncCents;

          // 5. Ajuste financiero según método de reembolso
          if (refundMethod === 'CREDITO_CARTERA') {
            await this.receivablesLedger.applyCreditNote(tx, {
              saleId: sale.id,
              invoiceNumber: sale.invoiceNumber,
              creditNoteNumber,
              amountCents: totalReturnCents,
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
            await this.cashService.recordMovementInTransaction(tx, {
              movementType: 'EGRESO_MANUAL',
              amount: centsToMoneyString(totalReturnCents),
              paymentMethod: 'EFECTIVO',
              reason: `Reembolso por Nota Crédito ${creditNoteNumber} de venta ${sale.invoiceNumber}`,
              referenceDocumentType: 'CREDIT_NOTE',
              referenceDocumentId: creditNoteNumber,
              createdByUserId: userId,
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
              incTotal: new Prisma.Decimal(centsToMoneyString(totalIncCents)),
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
              incTotal: creditNote.incTotal,
              total: creditNote.total,
              refundMethod: creditNote.refundMethod,
              bankAccountId:
                creditNote.refundMethod === 'TRANSFERENCIA' ? sale.bankAccountId : null,
              restock: creditNote.restock,
              costTotal: centsToMoneyString(totalCostCents),
              createdById: userId,
              createdAt: creditNote.createdAt,
            },
            tx,
          );

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
          await tx.auditEvent.create({
            data: {
              userId,
              action: 'sales:credit_note_confirmed',
              entity: 'CreditNote',
              entityId: creditNote.id,
              details: {
                creditNoteNumber: creditNote.creditNoteNumber,
                saleId: sale.id,
                total: creditNote.total,
                refundMethod: creditNote.refundMethod,
                restock: creditNote.restock,
              },
            },
          });
          return dto;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    });
  }

  /**
   * Anula una nota crédito confirmada (correcciones del cliente, 2026-11-02): la corrección se
   * hace sobre el documento, no reversando su asiento en el Libro Diario. En una transacción:
   * la mercancía reintegrada vuelve a salir de los mismos lotes, el reembolso vuelve a caja o
   * banco (o la factura vuelve a deberse en cartera), se reversa el asiento y queda auditoría.
   * Si la devolución entregó un cambio, primero hay que anular esa venta.
   */
  async cancelCreditNote(
    id: string,
    payload: CancelCreditNotePayload,
    userId: string,
  ): Promise<CreditNoteDto> {
    const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
    if (reason.length < 3 || reason.length > 500) {
      throw new BadRequestException('El motivo de la anulación es obligatorio (entre 3 y 500 caracteres).');
    }

    await executeWithRetry(() =>
      this.client.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<Array<{ sale_id: string }>>`
            SELECT sale_id FROM credit_notes WHERE id = ${id}::uuid FOR UPDATE
          `;
          if (!locked.length) {
            throw new NotFoundException(`Nota Crédito con id '${id}' no encontrada.`);
          }
          // Mismo orden de bloqueo que la emisión: serializa con otras notas de la venta
          await tx.$queryRaw`SELECT id FROM sales WHERE id = ${locked[0].sale_id}::uuid FOR UPDATE`;
          const note = await tx.creditNote.findUniqueOrThrow({
            where: { id },
            include: {
              sale: { select: { invoiceNumber: true, bankAccountId: true } },
              exchangeSale: { select: { invoiceNumber: true, status: true } },
              lines: { include: { saleLine: { select: { presentationId: true, presentationFactorHistorical: true } } } },
            },
          });
          if (note.status === 'ANULADA') {
            throw new ConflictException(`La nota crédito ${note.creditNoteNumber} ya está anulada.`);
          }
          if (note.exchangeSale && note.exchangeSale.status !== 'CANCELLED') {
            throw new ConflictException(
              `La nota crédito ${note.creditNoteNumber} entregó un cambio en la venta ${note.exchangeSale.invoiceNumber}: anule primero esa venta.`,
            );
          }

          // 1. La mercancía reintegrada vuelve a salir de los mismos lotes
          let restockCostCents = 0n;
          let issuedCostCents = 0n;
          if (note.restock) {
            const byProduct = new Map<string, Array<{ lotId: string; quantityBaseUnits: number }>>();
            for (const line of note.lines) {
              if (!line.lotId) continue;
              const lot = await this.inventoryLedger.lockLot(tx, line.lotId);
              if (!lot || lot.current_quantity < line.quantityBaseUnits) {
                throw new ConflictException(
                  `El lote ${lot?.lot_number ?? line.lotId} ya no tiene las ${line.quantityBaseUnits} unidades devueltas en la nota crédito ${note.creditNoteNumber}; no se puede anular.`,
                );
              }
              await this.inventoryLedger.changeLotQuantity(tx, line.lotId, -line.quantityBaseUnits, {
                movementType: 'SALIDA_ANULACION_DEVOLUCION',
                productId: line.productId,
                presentationId: line.saleLine?.presentationId || null,
                quantityBaseUnits: line.quantityBaseUnits,
                presentationFactorHistorical: line.saleLine?.presentationFactorHistorical ?? 1,
                referenceDocumentType: 'CREDIT_NOTE_CANCEL',
                referenceDocumentId: note.creditNoteNumber,
                notes: `Anulación de la devolución ${note.creditNoteNumber} (${reason})`,
                createdByUserId: userId,
              });
              const lots = byProduct.get(line.productId) ?? [];
              lots.push({ lotId: line.lotId, quantityBaseUnits: line.quantityBaseUnits });
              byProduct.set(line.productId, lots);
            }
            for (const [productId, lots] of byProduct) {
              issuedCostCents += await this.inventoryLedger.valuation.issue(tx, {
                productId,
                quantityBaseUnits: lots.reduce((acc, lot) => acc + lot.quantityBaseUnits, 0),
                movementType: 'SALE_RETURN_CANCELLATION',
                sourceType: 'CREDIT_NOTE_CANCEL',
                sourceId: note.creditNoteNumber,
                userId,
                lots,
              });
            }
            const restocked = await tx.inventoryValuationMovement.aggregate({
              where: { sourceType: 'CREDIT_NOTE', sourceId: note.creditNoteNumber, direction: 'IN' },
              _sum: { value: true },
            });
            restockCostCents = toCents(restocked._sum.value ?? 0, 'Costo reintegrado');
          }

          // 2. El reembolso se deshace por el mismo medio
          const totalCents = toCents(note.total, 'Total de la nota crédito');
          const concept = `Anulación de la Nota Crédito ${note.creditNoteNumber} de venta ${note.sale.invoiceNumber}`;
          if (note.refundMethod === 'CREDITO_CARTERA') {
            await this.receivablesLedger.revertCreditNote(tx, {
              saleId: note.saleId,
              invoiceNumber: note.sale.invoiceNumber,
              creditNoteNumber: note.creditNoteNumber,
              amountCents: totalCents,
            });
          } else if (note.refundMethod === 'TRANSFERENCIA') {
            await recordSourceBankMovement(tx, {
              bankAccountId: note.sale.bankAccountId!,
              movementType: 'DEPOSIT',
              amount: centsToMoneyString(totalCents),
              concept,
              referenceDocumentType: 'CREDIT_NOTE_CANCEL',
              referenceDocumentId: note.creditNoteNumber,
              createdById: userId,
            });
          } else {
            await this.cashService.recordMovementInTransaction(tx, {
              movementType: 'INGRESO_MANUAL',
              amount: centsToMoneyString(totalCents),
              paymentMethod: 'EFECTIVO',
              reason: concept,
              referenceDocumentType: 'CREDIT_NOTE_CANCEL',
              referenceDocumentId: note.creditNoteNumber,
              createdByUserId: userId,
            });
          }

          // 3. Estado del documento, reverso contable y auditoría
          await tx.creditNote.update({
            where: { id },
            data: { status: 'ANULADA', cancelledAt: new Date(), cancelledById: userId, cancellationReason: reason },
          });
          await this.accountingEngine.handleCreditNoteCancelled(
            {
              id: note.id,
              creditNoteNumber: note.creditNoteNumber,
              reason: `Anulación NC ${note.creditNoteNumber}: ${reason}`,
              userId,
              restockCostCents,
              issuedCostCents,
            },
            tx,
          );
          await tx.auditEvent.create({
            data: {
              userId,
              action: 'sales:credit_note_cancelled',
              entity: 'CreditNote',
              entityId: note.id,
              details: {
                creditNoteNumber: note.creditNoteNumber,
                saleId: note.saleId,
                total: note.total,
                refundMethod: note.refundMethod,
                restock: note.restock,
                reason,
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    return this.getCreditNoteById(id);
  }

  async listCreditNotes(saleId?: string): Promise<CreditNoteDto[]> {
    const where: Prisma.CreditNoteWhereInput = {};
    if (saleId) where.saleId = saleId;

    const notes = await this.client.creditNote.findMany({
      where,
      include: {
        customer: true,
        sale: true,
        exchangeSale: { select: { invoiceNumber: true } },
        createdByUser: { select: { id: true, username: true } },
        cancelledBy: { select: { username: true } },
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
        exchangeSale: { select: { invoiceNumber: true } },
        createdByUser: { select: { id: true, username: true } },
        cancelledBy: { select: { username: true } },
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
      exchangeSaleId: raw.exchangeSaleId ?? null,
      exchangeSaleInvoiceNumber: raw.exchangeSale?.invoiceNumber ?? null,
      status: raw.status,
      cancelledAt: raw.cancelledAt ? raw.cancelledAt.toISOString() : null,
      cancelledByName: raw.cancelledBy?.username ?? null,
      cancellationReason: raw.cancellationReason ?? null,
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
        lotNumber: l.lot?.lotNumber ?? null,
        expirationDate: l.lot?.expirationDate?.toISOString().split('T')[0] ?? null,
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
