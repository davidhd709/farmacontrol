import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import { DebitNoteDto, DebitNoteLineDto, CreateDebitNotePayload } from '@farmacia/contracts';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PayablesLedger } from '../../payables/application/payables-ledger';
import { InventoryLedger } from '../../inventory/application/inventory-ledger';
import { parseMoneyToCents, centsToMoneyString } from '../../treasury/domain/treasury-rules';
import { accountingPolicyAt } from '../../company/application/accounting-policy.reader';
import { businessToday } from '../../../common/utils/business-date';
import { companyTaxStatusAt } from '../../taxes/application/tax-context.reader';

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
export class DebitNotesService {
  private readonly client: PrismaClient;

  constructor(
    private readonly accountingEngine: AccountingEngineService,
    @Optional() customClient?: PrismaClient,
    @Optional() private readonly idempotencyService: IdempotencyService = new IdempotencyService(),
    @Optional() private readonly payablesLedger: PayablesLedger = new PayablesLedger(),
    @Optional() private readonly inventoryLedger: InventoryLedger = new InventoryLedger(),
  ) {
    this.client = customClient ?? prisma;
  }

  async createDebitNote(
    purchaseId: string,
    payload: CreateDebitNotePayload,
    userId: string,
    idempotencyKey?: string,
  ): Promise<DebitNoteDto> {
    const key = idempotencyKey?.trim();
    if (!key) {
      throw new BadRequestException('Idempotency-Key es obligatorio para emitir una nota débito.');
    }
    if (key.length > 100) {
      throw new BadRequestException('Idempotency-Key debe tener entre 1 y 100 caracteres.');
    }
    const endpoint = `/api/v1/purchases/${purchaseId}/debit-notes`;
    const requestHash = this.idempotencyService.computeHash(endpoint, userId, payload);

    if (!payload.items || payload.items.length === 0) {
      throw new BadRequestException('La nota débito debe incluir al menos una línea a devolver.');
    }
    const lineIds = payload.items.map((item) => item.purchaseLineId);
    if (new Set(lineIds).size !== lineIds.length) {
      throw new BadRequestException(
        'Cada línea de compra debe aparecer una sola vez en la nota débito.',
      );
    }

    return executeWithRetry(async () => {
      return this.client.$transaction(
        async (tx) => {
          // Serializa con otras notas débito de la misma compra
          await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${purchaseId}::uuid FOR UPDATE`;

          // Un reintento con la misma clave devuelve la nota ya emitida sin repetir efectos
          const cached = await this.idempotencyService.getRecord(key, requestHash, tx);
          if (cached) {
            return cached.responseBody as DebitNoteDto;
          }

          // 1. Obtener compra con sus líneas y notas débito existentes
          const purchase = await tx.purchase.findUnique({
            where: { id: purchaseId },
            include: {
              supplier: true,
              lines: {
                include: {
                  product: true,
                  lot: true,
                },
              },
              debitNotes: {
                include: { lines: true },
              },
            },
          });

          if (!purchase) {
            throw new NotFoundException(`Compra con id '${purchaseId}' no encontrada.`);
          }
          if (purchase.status !== 'RECEIVED') {
            throw new BadRequestException(
              `La compra ${purchase.invoiceNumber} no se encuentra en estado RECIBIDA. Estado actual: ${purchase.status}.`,
            );
          }

          // 2. Validar cantidades y disponibilidad de lotes para extracción
          const debitLinesData: Array<{
            purchaseLineId: string;
            productId: string;
            lotId: string;
            quantityCommercial: number;
            quantityBaseUnits: number;
            unitCost: Prisma.Decimal;
            subtotal: Prisma.Decimal;
            taxRate: Prisma.Decimal;
            taxAmount: Prisma.Decimal;
            total: Prisma.Decimal;
          }> = [];

          // Consecutivo antes de las líneas: el kardex referencia el número de la nota
          const count = await tx.debitNote.count();
          const debitNoteNumber = `ND-${String(count + 1).padStart(6, '0')}`;

          let totalSubtotalCents = 0n;
          let totalTaxCents = 0n;
          let totalDebitCents = 0n;
          let inventoryCostCents = 0n;

          for (const item of payload.items) {
            const line = purchase.lines.find((l) => l.id === item.purchaseLineId);
            if (!line) {
              throw new BadRequestException(
                `Línea de compra '${item.purchaseLineId}' no pertenece a la compra ${purchase.invoiceNumber}.`,
              );
            }

            if (item.quantityCommercial <= 0) {
              throw new BadRequestException(
                `La cantidad a devolver debe ser mayor a cero para el producto ${line.product.name}.`,
              );
            }

            const factor = line.presentationFactorHistorical || 1;
            const exactBaseUnits = item.quantityCommercial * factor;
            const quantityBaseUnits = Math.round(exactBaseUnits);
            // El inventario se lleva en unidades base enteras: no se redondea en silencio
            if (Math.abs(exactBaseUnits - quantityBaseUnits) > 1e-6) {
              throw new BadRequestException(
                `La cantidad ${item.quantityCommercial} con factor ${factor} no equivale a unidades base enteras.`,
              );
            }

            // El saldo devolvible se controla en unidades base, sin sumas de coma flotante
            let alreadyDebitedBaseUnits = 0;
            for (const dn of purchase.debitNotes) {
              for (const dnl of dn.lines) {
                if (dnl.purchaseLineId === line.id) {
                  alreadyDebitedBaseUnits += dnl.quantityBaseUnits;
                }
              }
            }
            const maxAvailableBaseUnits = line.quantityBaseUnits - alreadyDebitedBaseUnits;
            if (quantityBaseUnits > maxAvailableBaseUnits) {
              throw new BadRequestException(
                `Cantidad a devolver (${quantityBaseUnits} unidades base) excede el saldo de compra disponible (${maxAvailableBaseUnits} unidades base) para ${line.product.name}.`,
              );
            }

            // Bloquear el lote: una venta o ajuste concurrente no puede dejarlo en negativo
            const lockedLot = await this.inventoryLedger.lockLot(tx, line.lotId);
            if (!lockedLot) {
              throw new BadRequestException(
                `Lote de inventario para ${line.product.name} no encontrado.`,
              );
            }
            const lot = {
              id: lockedLot.id,
              lotNumber: lockedLot.lot_number,
              currentQuantity: lockedLot.current_quantity,
            };

            if (lot.currentQuantity < quantityBaseUnits) {
              throw new BadRequestException(
                `Existencias insuficientes en el lote ${lot.lotNumber} para devolver la mercancía. Disponible en inventario: ${lot.currentQuantity} unidades, requerido para devolución: ${quantityBaseUnits} unidades.`,
              );
            }

            // Descontar del lote y registrar movimiento de kardex
            await this.inventoryLedger.changeLotQuantity(tx, lot.id, -quantityBaseUnits, {
              movementType: 'SALIDA_DEVOLUCION_COMPRA',
              productId: line.productId,
              presentationId: line.presentationId || null,
              quantityBaseUnits,
              presentationFactorHistorical: line.presentationFactorHistorical,
              referenceDocumentType: 'DEBIT_NOTE',
              referenceDocumentId: debitNoteNumber,
              notes: `Devolución a proveedor ${purchase.supplier.name} s/factura ${purchase.invoiceNumber} (${payload.reason})`,
              createdByUserId: userId,
            });
            // Submayor de costos (ADR-005): la devolución sale al costo promedio vigente
            inventoryCostCents += await this.inventoryLedger.valuation.issue(tx, {
              productId: line.productId,
              quantityBaseUnits,
              movementType: 'PURCHASE_RETURN',
              sourceType: 'DEBIT_NOTE',
              sourceId: debitNoteNumber,
              userId,
              lots: [{ lotId: lot.id, quantityBaseUnits }],
            });

            const unitCost = new Prisma.Decimal(line.unitCost);
            const lineSubtotal = unitCost.mul(new Prisma.Decimal(item.quantityCommercial));
            // F8: el IVA de la línea de compra se devuelve en proporción a las unidades; la
            // última devolución de la línea se lleva el resto exacto
            const lineTaxRate = new Prisma.Decimal(line.vatRate);
            const purchaseLineVatCents = parseMoneyToCents(
              line.vatAmount.toFixed(2),
              'IVA de la línea',
            );
            const alreadyDebitedVatCents = purchase.debitNotes
              .flatMap((dn) => dn.lines)
              .filter((dnl) => dnl.purchaseLineId === line.id)
              .reduce(
                (sum, dnl) => sum + parseMoneyToCents(dnl.taxAmount.toFixed(2), 'IVA devuelto'),
                0n,
              );
            const returnsRest =
              alreadyDebitedBaseUnits + quantityBaseUnits === line.quantityBaseUnits;
            const lineTaxCents = returnsRest
              ? purchaseLineVatCents - alreadyDebitedVatCents
              : (purchaseLineVatCents * BigInt(quantityBaseUnits) * 2n +
                  BigInt(line.quantityBaseUnits)) /
                (BigInt(line.quantityBaseUnits) * 2n);

            const lineSubCents = parseMoneyToCents(lineSubtotal.toFixed(2), 'Subtotal compra');
            const lineTotCents = lineSubCents + lineTaxCents;

            totalSubtotalCents += lineSubCents;
            totalTaxCents += lineTaxCents;
            totalDebitCents += lineTotCents;

            debitLinesData.push({
              purchaseLineId: line.id,
              productId: line.productId,
              lotId: line.lotId,
              quantityCommercial: item.quantityCommercial,
              quantityBaseUnits,
              unitCost,
              subtotal: new Prisma.Decimal(centsToMoneyString(lineSubCents)),
              taxRate: lineTaxRate,
              taxAmount: new Prisma.Decimal(centsToMoneyString(lineTaxCents)),
              total: new Prisma.Decimal(centsToMoneyString(lineTotCents)),
            });
          }

          // F8: las retenciones de la compra se revierten en proporción al subtotal devuelto
          const purchaseSubtotalCents = purchase.subtotal
            ? parseMoneyToCents(purchase.subtotal.toFixed(2), 'Subtotal de la compra')
            : 0n;
          const proportional = (amount: Prisma.Decimal) => {
            const cents = parseMoneyToCents(amount.toFixed(2), 'Retención de la compra');
            if (cents === 0n || purchaseSubtotalCents === 0n) return 0n;
            return (
              (cents * totalSubtotalCents * 2n + purchaseSubtotalCents) /
              (purchaseSubtotalCents * 2n)
            );
          };
          const withholdingIncomeCents = proportional(purchase.withholdingIncome);
          const withholdingVatCents = proportional(purchase.withholdingVat);
          const withholdingIcaCents = proportional(purchase.withholdingIca);
          const withheldCents = withholdingIncomeCents + withholdingVatCents + withholdingIcaCents;
          // IVA descontable o mayor costo, según la empresa a la fecha de la compra (F6)
          const purchaseDay = purchase.purchaseDate.toISOString().slice(0, 10);
          const vatDeductible = (await companyTaxStatusAt(tx, purchaseDay))?.vatResponsible ?? true;

          // 4. Ajuste en Cuentas por Pagar: lo adeudado baja por el neto y lo pagado no cambia
          await this.payablesLedger.applyDebitNote(tx, {
            purchaseId: purchase.id,
            invoiceNumber: purchase.invoiceNumber,
            debitNoteNumber,
            amountCents: totalDebitCents - withheldCents,
          });

          // 5. Guardar la Nota Débito y sus líneas
          const debitNote = await tx.debitNote.create({
            data: {
              debitNoteNumber,
              purchaseId: purchase.id,
              supplierId: purchase.supplierId,
              reason: payload.reason,
              subtotal: new Prisma.Decimal(centsToMoneyString(totalSubtotalCents)),
              taxTotal: new Prisma.Decimal(centsToMoneyString(totalTaxCents)),
              total: new Prisma.Decimal(centsToMoneyString(totalDebitCents)),
              withholdingIncome: new Prisma.Decimal(centsToMoneyString(withholdingIncomeCents)),
              withholdingVat: new Prisma.Decimal(centsToMoneyString(withholdingVatCents)),
              withholdingIca: new Prisma.Decimal(centsToMoneyString(withholdingIcaCents)),
              createdById: userId,
              lines: {
                create: debitLinesData.map((dl) => ({
                  purchaseLineId: dl.purchaseLineId,
                  productId: dl.productId,
                  lotId: dl.lotId,
                  quantityCommercial: dl.quantityCommercial,
                  quantityBaseUnits: dl.quantityBaseUnits,
                  unitCost: dl.unitCost,
                  subtotal: dl.subtotal,
                  taxRate: dl.taxRate,
                  taxAmount: dl.taxAmount,
                  total: dl.total,
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
              supplier: true,
              purchase: true,
              createdByUser: {
                select: { id: true, username: true },
              },
            },
          });

          // 6. Generar Asiento Contable Automático (Partida Doble)
          await this.accountingEngine.handleDebitNoteConfirmed(
            {
              id: debitNote.id,
              debitNoteNumber: debitNote.debitNoteNumber,
              purchaseId: purchase.id,
              purchaseInvoiceNumber: purchase.invoiceNumber,
              supplierId: purchase.supplierId,
              supplierName: purchase.supplier.name,
              reason: debitNote.reason,
              subtotal: debitNote.subtotal,
              taxTotal: debitNote.taxTotal,
              total: debitNote.total,
              inventoryCost: centsToMoneyString(inventoryCostCents),
              vatDeductible,
              withholdingIncome: centsToMoneyString(withholdingIncomeCents),
              withholdingVat: centsToMoneyString(withholdingVatCents),
              withholdingIca: centsToMoneyString(withholdingIcaCents),
              variancePurpose: (await accountingPolicyAt(tx, businessToday()))
                .purchaseReturnVariancePurpose,
              createdById: userId,
              createdAt: debitNote.createdAt,
            },
            tx,
          );

          const dto = this.mapToDto(debitNote);
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
              action: 'purchases:debit_note_confirmed',
              entity: 'DebitNote',
              entityId: debitNote.id,
              details: {
                debitNoteNumber: debitNote.debitNoteNumber,
                purchaseId: purchase.id,
                total: debitNote.total,
                reason: debitNote.reason,
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

  async listDebitNotes(purchaseId?: string): Promise<DebitNoteDto[]> {
    const where: Prisma.DebitNoteWhereInput = {};
    if (purchaseId) where.purchaseId = purchaseId;

    const notes = await this.client.debitNote.findMany({
      where,
      include: {
        supplier: true,
        purchase: true,
        createdByUser: { select: { id: true, username: true } },
        lines: {
          include: { product: true, lot: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return notes.map((n) => this.mapToDto(n));
  }

  async getDebitNoteById(id: string): Promise<DebitNoteDto> {
    const note = await this.client.debitNote.findUnique({
      where: { id },
      include: {
        supplier: true,
        purchase: true,
        createdByUser: { select: { id: true, username: true } },
        lines: {
          include: { product: true, lot: true },
        },
      },
    });

    if (!note) {
      throw new NotFoundException(`Nota Débito con id '${id}' no encontrada.`);
    }

    return this.mapToDto(note);
  }

  private mapToDto(raw: any): DebitNoteDto {
    return {
      id: raw.id,
      debitNoteNumber: raw.debitNoteNumber,
      purchaseId: raw.purchaseId,
      purchaseInvoiceNumber: raw.purchase?.invoiceNumber,
      supplierId: raw.supplierId,
      supplierName: raw.supplier?.name,
      supplierTaxId: raw.supplier?.taxId,
      reason: raw.reason,
      subtotal: Number(raw.subtotal),
      taxTotal: Number(raw.taxTotal),
      total: Number(raw.total),
      createdById: raw.createdById,
      createdByName: raw.createdByUser?.username,
      createdAt: raw.createdAt.toISOString(),
      lines: (raw.lines || []).map((l: any): DebitNoteLineDto => ({
        id: l.id,
        purchaseLineId: l.purchaseLineId,
        productId: l.productId,
        productCode: l.product?.code,
        productName: l.product?.name,
        lotId: l.lotId,
        lotNumber: l.lot?.lotNumber ?? null,
        expirationDate: l.lot?.expirationDate?.toISOString().split('T')[0] ?? null,
        quantityCommercial: Number(l.quantityCommercial),
        quantityBaseUnits: l.quantityBaseUnits,
        unitCost: Number(l.unitCost),
        subtotal: Number(l.subtotal),
        taxRate: Number(l.taxRate),
        taxAmount: Number(l.taxAmount),
        total: Number(l.total),
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }
}
