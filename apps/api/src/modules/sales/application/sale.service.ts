import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import {
  SaleDto,
  ConfirmSalePayload,
  SaleQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { ISaleRepository, SALE_REPOSITORY } from '../domain/sale.repository';
import { Sale, SaleLine, SaleLotAllocation } from '../domain/sale.entity';
import {
  SaleNotFoundException,
  InsufficientStockException,
  SaleAlreadyCancelledException,
  SaleHasCreditNotesException,
  SaleHasActivePaymentsException,
} from '../domain/sale.exceptions';
import { IdempotencyService } from '../infrastructure/idempotency.service';
import {
  exceedsDiscountLimit,
  MAX_DISCOUNT_PCT_WITHOUT_AUTHORIZATION,
  SaleDiscountNotAuthorizedException,
} from '../domain/discount-policy';
import { AuditService } from '../../audit/application/services/audit.service';
import { recordSourceBankMovement } from '../../treasury/application/record-source-bank-movement';
import { requirePaymentBankAccountId } from '../../treasury/application/payment-idempotency';
import { parseMoneyToCents } from '../../treasury/domain/treasury-rules';
import {
  calculateNewCashBalanceCents,
  centsToMoneyString,
} from '../../cash/domain/cash-rules';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';

const SALE_CONFIRM_ENDPOINT = '/api/v1/sales/confirm';

export interface AuditContext {
  userId?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
  /** AUD-011: el usuario puede autorizar rebajas por encima del límite del cajero. */
  canOverrideDiscount?: boolean;
}

/**
 * Detecta si un error es un conflicto de concurrencia o serialización recuperable en PostgreSQL/Prisma.
 */
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

/**
 * Ejecuta una operación transaccional reintentando automáticamente en caso de
 * conflictos de serialización (P2034 / SQLSTATE 40001), colisiones de consecutivo (P2002)
 * o deadlocks transitorios concurrentes.
 */
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
export class SaleService {
  private readonly client: PrismaClient;

  constructor(
    @Inject(SALE_REPOSITORY)
    private readonly saleRepository: ISaleRepository,
    private readonly idempotencyService: IdempotencyService,
    @Optional() customClient?: PrismaClient,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly accountingEngine?: AccountingEngineService,
  ) {
    this.client = customClient ?? prisma;
  }

  public async confirmSale(
    payload: ConfirmSalePayload,
    auditCtx: AuditContext,
    idempotencyKey?: string,
  ): Promise<SaleDto> {
    if (!payload.items || payload.items.length === 0) {
      throw new Error('La venta debe incluir al menos un producto.');
    }
    const key = idempotencyKey?.trim();
    if (!key) {
      throw new BadRequestException('Idempotency-Key es obligatorio para confirmar una venta.');
    }
    if (key.length > 100) {
      throw new BadRequestException('Idempotency-Key debe tener entre 1 y 100 caracteres.');
    }
    if (payload.paymentMethod === 'TRANSFERENCIA') {
      requirePaymentBankAccountId(payload.bankAccountId);
    } else if (payload.paymentMethod === 'CREDITO') {
      if (payload.bankAccountId) {
        throw new BadRequestException('bankAccountId no aplica para ventas a crédito.');
      }
    } else if (payload.paymentMethod !== 'EFECTIVO') {
      throw new BadRequestException(
        'El pago con tarjeta requiere una política de liquidación aprobada.',
      );
    } else if (payload.bankAccountId) {
      throw new BadRequestException('bankAccountId solo corresponde a TRANSFERENCIA.');
    }

    const requestHash = this.idempotencyService.computeHash(
      SALE_CONFIRM_ENDPOINT,
      auditCtx.userId ?? '',
      payload,
    );

    // Transacción ACID completa en PostgreSQL con reintentos ante conflictos de serialización
    const { sale: saleResult, replayed } = await executeWithRetry(async () => {
      return this.client.$transaction(async (tx) => {
        // 1. Verificación de Idempotencia dentro de la transacción: un reintento por
        // conflicto con una petición duplicada concurrente encuentra la venta ya registrada
        const cached = await this.idempotencyService.getRecord(key, requestHash, tx);
        if (cached) {
          return { sale: cached.responseBody as SaleDto, replayed: true };
        }

        // 2.1. Resolver Cliente
      let customerId = payload.customerId;
      let customerName = 'Consumidor Final (Cuantías Menores)';
      let customerDoc = '222222222222';

      if (customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
        });
        if (!customer) {
          throw new Error(`Cliente con id '${customerId}' no existe.`);
        }
        customerName = customer.name;
        customerDoc = customer.documentNumber;
      } else {
        const defaultCust = await tx.customer.findFirst({
          where: { isDefault: true, isActive: true },
        });
        if (defaultCust) {
          customerId = defaultCust.id;
          customerName = defaultCust.name;
          customerDoc = defaultCust.documentNumber;
        } else {
          throw new Error('No se encontró el cliente por defecto (Consumidor Final).');
        }
      }

      // 2.2. Consecutivo de Factura
      const invoiceNumber = await this.saleRepository.generateNextInvoiceNumber(tx);

      // 2.3. Procesar Líneas y Asignación FEFO
      const saleId = crypto.randomUUID();
      const saleLines: SaleLine[] = [];
      const allLotAllocations: SaleLotAllocation[] = [];

      for (const item of payload.items) {
        if (item.quantityCommercial <= 0) {
          throw new Error('La cantidad de cada producto debe ser mayor a cero.');
        }

        // Obtener producto
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product || !product.isActive) {
          throw new Error(`Producto con id '${item.productId}' no existe o está inactivo.`);
        }

        // Obtener presentación si aplica
        let factor = 1;
        let unitPrice = Number(product.basePrice);
        let presentationName: string | null = null;

        if (item.presentationId) {
          const presentation = await tx.productPresentation.findUnique({
            where: { id: item.presentationId },
          });
          if (!presentation || !presentation.isActive || presentation.productId !== product.id) {
            throw new Error(`Presentación '${item.presentationId}' inválida para el producto.`);
          }
          if (!presentation.saleEnabled) {
            throw new Error(
              `La presentación '${presentation.name}' no está habilitada para ventas.`,
            );
          }
          factor = presentation.conversionFactor;
          unitPrice = Number(presentation.price);
          presentationName = presentation.name;
        }

        const listUnitPrice = unitPrice;
        if (item.unitPriceOverride !== undefined && item.unitPriceOverride >= 0) {
          unitPrice = item.unitPriceOverride;
        }

        // AUD-011: rebajas sobre el precio de lista limitadas sin autorización
        if (
          !auditCtx.canOverrideDiscount &&
          exceedsDiscountLimit({
            quantityCommercial: item.quantityCommercial,
            listUnitPrice,
            chargedUnitPrice: unitPrice,
            discount: item.discount ?? 0,
            maxPct: MAX_DISCOUNT_PCT_WITHOUT_AUTHORIZATION,
          })
        ) {
          throw new SaleDiscountNotAuthorizedException(
            product.name,
            MAX_DISCOUNT_PCT_WITHOUT_AUTHORIZATION,
          );
        }

        const requiredBaseUnits = Math.round(item.quantityCommercial * factor);
        const lineId = crypto.randomUUID();
        const lineAllocations: SaleLotAllocation[] = [];

        // Asignación FEFO con bloqueo concurrente
        if (product.requiresLotControl) {
          // Bloquear lotes disponibles ordenados por vencimiento ascendente
          const availableLots = await tx.$queryRaw<
            Array<{
              id: string;
              lot_number: string;
              expiration_date: Date;
              current_quantity: number;
            }>
          >`
            SELECT id, lot_number, expiration_date, current_quantity
            FROM inventory_lots
            WHERE product_id = ${product.id}::uuid
              AND is_active = true
              AND current_quantity > 0
              AND expiration_date >= CURRENT_DATE
            ORDER BY expiration_date ASC, created_at ASC
            FOR UPDATE
          `;

          const totalAvailable = availableLots.reduce((acc, l) => acc + l.current_quantity, 0);
          if (totalAvailable < requiredBaseUnits) {
            throw new InsufficientStockException(product.name, requiredBaseUnits, totalAvailable);
          }

          let remainingUnits = requiredBaseUnits;

          for (const lot of availableLots) {
            if (remainingUnits <= 0) break;

            const take = Math.min(lot.current_quantity, remainingUnits);
            const balanceAfter = lot.current_quantity - take;

            // Descontar existencias del lote
            await tx.inventoryLot.update({
              where: { id: lot.id },
              data: {
                currentQuantity: balanceAfter,
                updatedAt: new Date(),
              },
            });

            // Registrar Kardex inmutable
            await tx.inventoryMovement.create({
              data: {
                movementType: 'SALIDA_VENTA',
                productId: product.id,
                lotId: lot.id,
                presentationId: item.presentationId || null,
                quantityBaseUnits: take,
                presentationFactorHistorical: factor,
                balanceAfterBaseUnits: balanceAfter,
                referenceDocumentType: 'SALE',
                referenceDocumentId: invoiceNumber,
                notes: `Venta POS ${invoiceNumber} - Despacho FEFO`,
                createdByUserId: auditCtx.userId || null,
              },
            });

            const alloc = SaleLotAllocation.create({
              saleId,
              saleLineId: lineId,
              lotId: lot.id,
              lotNumber: lot.lot_number,
              expirationDate: new Date(lot.expiration_date).toISOString().split('T')[0],
              quantityBaseUnits: take,
            });

            lineAllocations.push(alloc);
            allLotAllocations.push(alloc);
            remainingUnits -= take;
          }
        }

        const saleLine = SaleLine.create({
          id: lineId,
          saleId,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          presentationId: item.presentationId || null,
          presentationName,
          presentationFactorHistorical: factor,
          quantityCommercial: item.quantityCommercial,
          unitPrice,
          discount: item.discount ?? 0,
          lotAllocations: lineAllocations,
        });

        saleLines.push(saleLine);
      }

      // 2.4. Crear Entidad Sale
      const sale = Sale.create({
        id: saleId,
        invoiceNumber,
        customerId: customerId!,
        customerName,
        customerDocument: customerDoc,
        paymentMethod: payload.paymentMethod,
        bankAccountId: payload.paymentMethod === 'TRANSFERENCIA' ? payload.bankAccountId : null,
        lines: saleLines,
        amountPaid: payload.amountPaid,
        notes: payload.notes,
        createdById: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
      });

      // 2.5. Persistir Venta y Asignaciones
      await this.saleRepository.save(sale, tx);

      if (payload.paymentMethod === 'TRANSFERENCIA') {
        if (
          payload.amountPaid !== undefined &&
          parseMoneyToCents(String(payload.amountPaid), 'Monto recibido') !==
            parseMoneyToCents(new Prisma.Decimal(sale.total).toFixed(2), 'Total de venta')
        ) {
          throw new Error(
            'En una transferencia, el monto recibido debe coincidir con el total de la venta.',
          );
        }
        await recordSourceBankMovement(tx, {
          bankAccountId: payload.bankAccountId!,
          movementType: 'DEPOSIT',
          amount: new Prisma.Decimal(sale.total).toFixed(2),
          concept: `Venta mostrador comprobante ${sale.invoiceNumber}`,
          referenceDocumentType: 'SALE',
          referenceDocumentId: sale.invoiceNumber,
          createdById: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
        });
      }

      // 2.6. Movimiento de Caja si es Efectivo
      if (payload.paymentMethod === 'EFECTIVO') {
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

        const saleAmountCents = parseMoneyToCents(
          new Prisma.Decimal(sale.total).toFixed(2),
          'Total de venta',
        );

        const { balanceAfter } = calculateNewCashBalanceCents(
          currentBalanceCents,
          'INGRESO_VENTA',
          saleAmountCents,
        );

        await tx.cashMovement.create({
          data: {
            movementType: 'INGRESO_VENTA',
            amount: new Prisma.Decimal(centsToMoneyString(saleAmountCents)),
            paymentMethod: 'EFECTIVO',
            reason: `Venta mostrador comprobante ${sale.invoiceNumber}`,
            referenceDocumentType: 'SALE',
            referenceDocumentId: sale.invoiceNumber,
            balanceAfter: new Prisma.Decimal(centsToMoneyString(balanceAfter)),
            createdByUserId: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
          },
        });
      }

      // 2.7. Cuenta por Cobrar si es Crédito
      if (payload.paymentMethod === 'CREDITO') {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        await tx.receivable.create({
          data: {
            saleId: sale.id,
            customerId: customerId!,
            totalAmount: new Prisma.Decimal(sale.total).toFixed(2),
            amountPaid: '0.00',
            balance: new Prisma.Decimal(sale.total).toFixed(2),
            status: 'PENDIENTE',
            dueDate,
            notes: payload.notes || `Venta a crédito comprobante ${sale.invoiceNumber}`,
          },
        });
      }

      // 2.6.1. Contabilidad automática de partida doble (asiento automático)
      if (this.accountingEngine) {
        await this.accountingEngine.handleSaleConfirmed(
          {
            id: sale.id,
            invoiceNumber: sale.invoiceNumber,
            total: sale.total,
            subtotal: sale.subtotal,
            taxTotal: sale.taxTotal,
            paymentMethod: sale.paymentMethod,
            createdById: sale.createdById,
            createdAt: sale.createdAt,
            lines: sale.lines.map((l) => ({
              productId: l.productId,
              quantityCommercial: l.quantityCommercial,
              quantityBaseUnits: l.quantityBaseUnits,
              presentationFactorHistorical: l.presentationFactorHistorical,
              lotAllocations: l.lotAllocations.map((a) => ({
                lotId: a.lotId,
                quantityBaseUnits: a.quantityBaseUnits,
              })),
            })),
          },
          tx,
        );
      }

      const dto = sale.toDto();

      // 2.7. Guardar registro de Idempotencia dentro de la transacción
      await this.idempotencyService.saveRecord(
        {
          key,
          userId: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
          endpoint: SALE_CONFIRM_ENDPOINT,
          requestHash,
          responseStatus: 201,
          responseBody: dto,
          ttlHours: 24,
        },
        tx,
      );

      return { sale: dto, replayed: false };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

    // 3. Auditoría asíncrona fuera de la transacción (un reintento no es una venta nueva)
    if (this.auditService && !replayed) {
      await this.auditService.recordEvent({
        action: 'sales:sale_confirmed',
        entity: 'Sale',
        entityId: saleResult.id,
        userId: auditCtx.userId || null,
        details: {
          invoiceNumber: saleResult.invoiceNumber,
          total: saleResult.total,
          paymentMethod: saleResult.paymentMethod,
          itemsCount: saleResult.lines.length,
        },
        ipAddress: auditCtx.ipAddress || null,
        correlationId: auditCtx.correlationId || null,
      });
    }

    return saleResult;
  }

  public async getSaleById(id: string): Promise<SaleDto> {
    const sale = await this.saleRepository.findById(id);
    if (!sale) {
      throw new SaleNotFoundException(id);
    }
    return sale.toDto();
  }

  public async getSales(filters: SaleQueryFilters): Promise<PaginatedResponse<SaleDto>> {
    const { items, total } = await this.saleRepository.findAll(filters);
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

    return {
      items: items.map((s) => s.toDto()),
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  public async cancelSale(id: string, reason: string, auditCtx: AuditContext): Promise<SaleDto> {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new Error('El motivo de anulación es obligatorio');
    }

    const sale = await this.saleRepository.findById(id);
    if (!sale) {
      throw new SaleNotFoundException(id);
    }
    if (sale.status === 'CANCELLED') {
      throw new SaleAlreadyCancelledException(sale.invoiceNumber);
    }

    // Transacción ACID de reversión con reintentos ante conflictos de concurrencia
    const cancelledDto = await executeWithRetry(async () => {
      return this.client.$transaction(async (tx) => {
        const lockedSales = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM sales WHERE id = ${id}::uuid FOR UPDATE
      `;
      if (!lockedSales.length) throw new SaleNotFoundException(id);
      if (lockedSales[0].status === 'CANCELLED') {
        throw new SaleAlreadyCancelledException(sale.invoiceNumber);
      }
      // Una nota crédito ya devolvió parte de la venta: anularla reintegraría dos veces
      const creditNotesCount = await tx.creditNote.count({ where: { saleId: id } });
      if (creditNotesCount > 0) {
        throw new SaleHasCreditNotesException(sale.invoiceNumber, creditNotesCount);
      }
      // AUD-006: la anulación no devuelve abonos; deben reversarse antes en Cartera
      if (sale.paymentMethod === 'CREDITO') {
        const activePaymentsCount = await tx.receivablePayment.count({
          where: { receivable: { saleId: id }, isReversed: false },
        });
        if (activePaymentsCount > 0) {
          throw new SaleHasActivePaymentsException(sale.invoiceNumber, activePaymentsCount);
        }
      }
      sale.cancel();
      await this.saleRepository.save(sale, tx);

      // Reintegrar unidades a los lotes originales exactos
      for (const line of sale.lines) {
        for (const alloc of line.lotAllocations) {
          // Bloquear lote
          const lotRows = await tx.$queryRaw<Array<{ current_quantity: number }>>`
            SELECT current_quantity
            FROM inventory_lots
            WHERE id = ${alloc.lotId}::uuid
            FOR UPDATE
          `;

          const currentQty = lotRows.length > 0 ? lotRows[0].current_quantity : 0;
          const restoredQty = currentQty + alloc.quantityBaseUnits;

          await tx.inventoryLot.update({
            where: { id: alloc.lotId },
            data: {
              currentQuantity: restoredQty,
              updatedAt: new Date(),
            },
          });

          // Registrar movimiento inmutable de reversión en Kardex
          await tx.inventoryMovement.create({
            data: {
              movementType: 'DEVOLUCION_CLIENTE',
              productId: line.productId,
              lotId: alloc.lotId,
              presentationId: line.presentationId || null,
              quantityBaseUnits: alloc.quantityBaseUnits,
              presentationFactorHistorical: line.presentationFactorHistorical,
              balanceAfterBaseUnits: restoredQty,
              referenceDocumentType: 'SALE_CANCEL',
              referenceDocumentId: sale.invoiceNumber,
              notes: `Anulación venta ${sale.invoiceNumber}. Motivo: ${trimmedReason}`,
              createdByUserId: auditCtx.userId || null,
            },
          });
        }
      }

      // Revertir en caja si fue en efectivo
      if (sale.paymentMethod === 'EFECTIVO') {
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

        const saleAmountCents = parseMoneyToCents(
          new Prisma.Decimal(sale.total).toFixed(2),
          'Total de venta',
        );

        const { balanceAfter } = calculateNewCashBalanceCents(
          currentBalanceCents,
          'EGRESO_MANUAL',
          saleAmountCents,
        );

        await tx.cashMovement.create({
          data: {
            movementType: 'EGRESO_MANUAL',
            amount: new Prisma.Decimal(centsToMoneyString(saleAmountCents)),
            paymentMethod: 'EFECTIVO',
            reason: `Reversión por anulación de venta ${sale.invoiceNumber}: ${trimmedReason}`,
            referenceDocumentType: 'SALE_CANCEL',
            referenceDocumentId: sale.invoiceNumber,
            balanceAfter: new Prisma.Decimal(centsToMoneyString(balanceAfter)),
            createdByUserId: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
          },
        });
      }
      if (sale.paymentMethod === 'TRANSFERENCIA') {
        if (!sale.bankAccountId)
          throw new Error('La venta por transferencia no conserva una cuenta bancaria.');
        await recordSourceBankMovement(tx, {
          bankAccountId: sale.bankAccountId,
          movementType: 'WITHDRAWAL',
          amount: new Prisma.Decimal(sale.total).toFixed(2),
          concept: `Reversión por anulación de venta ${sale.invoiceNumber}: ${trimmedReason}`,
          referenceDocumentType: 'SALE_CANCEL',
          referenceDocumentId: sale.invoiceNumber,
          createdById: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
        });
      }
      if (sale.paymentMethod === 'CREDITO') {
        await tx.receivable.updateMany({
          where: { saleId: sale.id },
          data: { status: 'CANCELADA', notes: `Venta anulada: ${trimmedReason}` },
        });
      }

      // Reversión contable automática
      if (this.accountingEngine) {
        await this.accountingEngine.handleSaleCancelled(
          sale.id,
          trimmedReason,
          auditCtx.userId || undefined,
          tx,
        );
      }

      return sale.toDto();
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'sales:sale_cancelled',
        entity: 'Sale',
        entityId: sale.id,
        userId: auditCtx.userId || null,
        details: {
          invoiceNumber: sale.invoiceNumber,
          reason: trimmedReason,
          total: sale.total,
        },
        ipAddress: auditCtx.ipAddress || null,
        correlationId: auditCtx.correlationId || null,
      });
    }

    return cancelledDto;
  }
}
