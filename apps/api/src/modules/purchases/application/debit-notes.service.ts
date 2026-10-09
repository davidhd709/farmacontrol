import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import {
  DebitNoteDto,
  DebitNoteLineDto,
  CreateDebitNotePayload,
} from '@farmacia/contracts';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';
import { parseMoneyToCents, centsToMoneyString } from '../../treasury/domain/treasury-rules';

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
    @Optional() customClient?: PrismaClient,
    @Optional() private readonly accountingEngine?: AccountingEngineService,
  ) {
    this.client = customClient ?? prisma;
  }

  async createDebitNote(
    purchaseId: string,
    payload: CreateDebitNotePayload,
    userId: string,
  ): Promise<DebitNoteDto> {
    if (!payload.items || payload.items.length === 0) {
      throw new BadRequestException('La nota débito debe incluir al menos una línea a devolver.');
    }

    return executeWithRetry(async () => {
      return this.client.$transaction(
        async (tx) => {
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

          let totalSubtotalCents = 0n;
          let totalTaxCents = 0n;
          let totalDebitCents = 0n;

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

            let alreadyDebited = 0;
            for (const dn of purchase.debitNotes) {
              for (const dnl of dn.lines) {
                if (dnl.purchaseLineId === line.id) {
                  alreadyDebited += Number(dnl.quantityCommercial);
                }
              }
            }

            const maxAvailable = Number(line.quantityCommercial) - alreadyDebited;
            if (item.quantityCommercial > maxAvailable + 0.0001) {
              throw new BadRequestException(
                `Cantidad a devolver (${item.quantityCommercial}) excede el saldo de compra disponible (${maxAvailable}) para ${line.product.name}.`,
              );
            }

            const factor = line.presentationFactorHistorical || 1;
            const quantityBaseUnits = Math.round(item.quantityCommercial * factor);

            // Bloquear lote para salida y verificar que no quede en saldo negativo
            const lot = await tx.inventoryLot.findUnique({
              where: { id: line.lotId },
            });

            if (!lot) {
              throw new BadRequestException(`Lote de inventario para ${line.product.name} no encontrado.`);
            }

            if (lot.currentQuantity < quantityBaseUnits) {
              throw new BadRequestException(
                `Existencias insuficientes en el lote ${lot.lotNumber} para devolver la mercancía. Disponible en inventario: ${lot.currentQuantity} unidades, requerido para devolución: ${quantityBaseUnits} unidades.`,
              );
            }

            // Descontar del lote
            const updatedLot = await tx.inventoryLot.update({
              where: { id: lot.id },
              data: {
                currentQuantity: { decrement: quantityBaseUnits },
              },
            });

            // Registrar movimiento de kardex
            await tx.inventoryMovement.create({
              data: {
                movementType: 'SALIDA_DEVOLUCION_COMPRA',
                productId: line.productId,
                lotId: lot.id,
                presentationId: line.presentationId || null,
                quantityBaseUnits,
                presentationFactorHistorical: line.presentationFactorHistorical,
                balanceAfterBaseUnits: updatedLot.currentQuantity,
                referenceDocumentType: 'DEBIT_NOTE',
                referenceDocumentId: purchase.invoiceNumber,
                notes: `Devolución a proveedor ${purchase.supplier.name} s/factura ${purchase.invoiceNumber} (${payload.reason})`,
                createdByUserId: userId,
              },
            });

            const unitCost = new Prisma.Decimal(line.unitCost);
            const lineSubtotal = unitCost.mul(new Prisma.Decimal(item.quantityCommercial));
            const lineTaxRate = new Prisma.Decimal(0); // Compras base
            const lineTax = new Prisma.Decimal(0);
            const lineTotal = lineSubtotal;

            const lineSubCents = parseMoneyToCents(lineSubtotal.toFixed(2), 'Subtotal compra');
            const lineTaxCents = 0n;
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

          // 3. Consecutivo de Nota Débito
          const count = await tx.debitNote.count();
          const debitNoteNumber = `ND-${String(count + 1).padStart(6, '0')}`;

          // 4. Ajuste en Cuentas por Pagar: lo adeudado baja y lo pagado no cambia
          const payables = await tx.$queryRaw<
            Array<{
              id: string;
              total_amount: Prisma.Decimal;
              balance: Prisma.Decimal;
              status: string;
              notes: string | null;
            }>
          >`
            SELECT id, total_amount, balance, status, notes
            FROM payables
            WHERE purchase_id = ${purchase.id}::uuid
            FOR UPDATE
          `;
          if (!payables.length) {
            throw new BadRequestException(
              `La compra ${purchase.invoiceNumber} no tiene cuenta por pagar asociada.`,
            );
          }
          const payable = payables[0];
          const balanceCents = parseMoneyToCents(payable.balance.toString(), 'Saldo por pagar');
          if (totalDebitCents > balanceCents) {
            // El asiento debita Proveedores por el total: recortar el saldo descuadraría la cartera
            throw new ConflictException(
              `La devolución (${centsToMoneyString(totalDebitCents)}) supera el saldo pendiente de la cuenta por pagar (${centsToMoneyString(balanceCents)}).`,
            );
          }
          const newTotalCents =
            parseMoneyToCents(payable.total_amount.toString(), 'Total por pagar') - totalDebitCents;
          const newBalanceCents = balanceCents - totalDebitCents;

          await tx.payable.update({
            where: { id: payable.id },
            data: {
              totalAmount: new Prisma.Decimal(centsToMoneyString(newTotalCents)),
              balance: new Prisma.Decimal(centsToMoneyString(newBalanceCents)),
              status: newBalanceCents === 0n ? 'PAGADA' : payable.status,
              notes: `${payable.notes || ''} [Nota Débito ${debitNoteNumber}: -${centsToMoneyString(totalDebitCents)}]`.trim(),
            },
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
          if (this.accountingEngine) {
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
                createdById: userId,
                createdAt: debitNote.createdAt,
              },
              tx,
            );
          }

          return this.mapToDto(debitNote);
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
        lotNumber: l.lot?.lotNumber,
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
