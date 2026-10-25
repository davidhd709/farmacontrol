import { businessToday, addCalendarDays, calendarDate } from '../../../common/utils/business-date';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import {
  SaleDto,
  ConfirmSalePayload,
  FefoPreviewPayload,
  FefoPreviewDto,
  FefoPreviewLinePayload,
  SaleQueryFilters,
  PaginatedResponse,
  SYSTEM_PERMISSIONS,
} from '@farmacia/contracts';
import { ISaleRepository, SALE_REPOSITORY } from '../domain/sale.repository';
import { Sale, SaleLine, SaleLotAllocation } from '../domain/sale.entity';
import {
  SaleNotFoundException,
  InsufficientStockException,
  SaleAlreadyCancelledException,
  SaleHasCreditNotesException,
  SaleHasReceivablePaymentsException,
  ProductWithoutLotControlException,
} from '../domain/sale.exceptions';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { AuditService } from '../../audit/application/services/audit.service';
import { CashService } from '../../cash/application/cash.service';
import { ReceivablesLedger } from '../../receivables/application/receivables-ledger';
import { planFefoAllocation } from '../domain/plan-fefo-allocation';
import { saleBaseUnits } from '../domain/sale-base-units';
import { InventoryLedger, LockedLot } from '../../inventory/application/inventory-ledger';
import { recordSourceBankMovement } from '../../treasury/application/record-source-bank-movement';
import { requirePaymentBankAccountId } from '../../treasury/application/payment-validation';
import { parseMoneyToCents } from '../../treasury/domain/treasury-rules';
import { centsToMoneyString } from '../../cash/domain/cash-rules';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';

const SALE_CONFIRM_ENDPOINT = '/api/v1/sales/confirm';

export interface AuditContext {
  userId?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
  /** Permisos efectivos del usuario autenticado; se exigen para precio y descuento manual */
  permissions?: readonly string[];
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
    private readonly cashService: CashService,
    private readonly receivablesLedger: ReceivablesLedger,
    private readonly inventoryLedger: InventoryLedger,
    private readonly accountingEngine: AccountingEngineService,
    private readonly auditService: AuditService,
    @Optional() customClient?: PrismaClient,
  ) {
    this.client = customClient ?? prisma;
  }

  /**
   * Costo con que salió una línea. Las ventas anteriores al submayor (ADR-005) no tienen
   * cost_value: su asiento usó el costo por unidad base guardado en la línea o, si tampoco
   * existe, el costo del catálogo.
   */
  private async recordedLineCost(
    tx: Prisma.TransactionClient,
    line: SaleLine,
    quantityBaseUnits: number,
  ): Promise<bigint> {
    if (line.costValue !== null) return parseMoneyToCents(line.costValue, 'Costo de la línea');
    const unitCost =
      line.unitCostBase ??
      (
        await tx.product.findUniqueOrThrow({
          where: { id: line.productId },
          select: { baseCost: true },
        })
      ).baseCost.toFixed(2);
    return parseMoneyToCents(unitCost, 'Costo base') * BigInt(quantityBaseUnits);
  }

  /** La vista previa no bloquea ni reserva: confirmar vuelve a resolver FEFO con FOR UPDATE. */
  public async previewFefo(payload: FefoPreviewPayload): Promise<FefoPreviewDto> {
    const businessDay = businessToday();
    const remainingLots = new Map<string, LockedLot[]>();
    const lines: FefoPreviewDto['lines'] = [];
    for (const item of payload.items) {
      const { product, requiredBaseUnits } = await this.resolveSaleItem(this.client, item);
      let lots = remainingLots.get(product.id);
      if (!lots) {
        lots = await this.inventoryLedger.listFefoCandidates(this.client, product.id, businessDay);
        remainingLots.set(product.id, lots);
      }
      const availableBaseUnits = lots.reduce((sum, lot) => sum + lot.current_quantity, 0);
      const plan = planFefoAllocation(lots, requiredBaseUnits);
      const allocations = plan.allocations.map(({ lot, quantityBaseUnits }) => {
        // Sólo cambia el saldo local de esta consulta para las siguientes líneas del producto.
        lot.current_quantity -= quantityBaseUnits;
        return {
          lotId: lot.id,
          lotNumber: lot.lot_number,
          expirationDate: lot.expiration_date.toISOString().slice(0, 10),
          quantityBaseUnits,
        };
      });
      lines.push({
        productId: product.id,
        presentationId: item.presentationId || null,
        requiredBaseUnits,
        availableBaseUnits,
        shortfallBaseUnits: plan.shortfallBaseUnits,
        allocations,
      });
    }
    return { businessDay, lines };
  }

  /** Resolución y validaciones de catálogo compartidas con la confirmación transaccional. */
  private async resolveSaleItem(client: Prisma.TransactionClient, item: FefoPreviewLinePayload) {
    if (!Number.isFinite(item.quantityCommercial) || item.quantityCommercial <= 0) {
      throw new BadRequestException('La cantidad de cada producto debe ser mayor a cero.');
    }
    const product = await client.product.findUnique({ where: { id: item.productId } });
    if (!product || !product.isActive) {
      throw new BadRequestException(
        `Producto con id '${item.productId}' no existe o está inactivo.`,
      );
    }
    let factor = 1;
    let unitPrice = Number(product.basePrice);
    let presentationName: string | null = null;
    if (item.presentationId) {
      const presentation = await client.productPresentation.findUnique({
        where: { id: item.presentationId },
      });
      if (!presentation || !presentation.isActive || presentation.productId !== product.id) {
        throw new BadRequestException(
          `Presentación '${item.presentationId}' inválida para el producto.`,
        );
      }
      if (!presentation.saleEnabled) {
        throw new BadRequestException(
          `La presentación '${presentation.name}' no está habilitada para ventas.`,
        );
      }
      factor = presentation.conversionFactor;
      unitPrice = Number(presentation.price);
      presentationName = presentation.name;
    }
    // FARM-AUD-002: toda línea descuenta existencias por FEFO. Un producto antiguo sin control
    // de lote se rechaza antes de tocar inventario.
    if (!product.requiresLotControl) {
      throw new ProductWithoutLotControlException(product.name);
    }
    const requiredBaseUnits = saleBaseUnits(item.quantityCommercial, factor);
    return { product, factor, unitPrice, presentationName, requiredBaseUnits };
  }

  public async confirmSale(
    payload: ConfirmSalePayload,
    auditCtx: AuditContext,
    idempotencyKey?: string,
  ): Promise<SaleDto> {
    if (!payload.items || payload.items.length === 0) {
      throw new BadRequestException('La venta debe incluir al menos un producto.');
    }
    const key = idempotencyKey?.trim();
    if (!key) {
      throw new BadRequestException('Idempotency-Key es obligatorio para confirmar una venta.');
    }
    if (key.length > 100) {
      throw new BadRequestException('Idempotency-Key debe tener entre 1 y 100 caracteres.');
    }
    // Precio y descuento manual se autorizan en backend, no solo ocultando campos en el POS
    const permissions = auditCtx.permissions ?? [];
    if (
      payload.items.some((item) => item.unitPriceOverride !== undefined) &&
      !permissions.includes(SYSTEM_PERMISSIONS.SALES_PRICE_OVERRIDE)
    ) {
      throw new ForbiddenException('No tiene permiso para cambiar el precio unitario de venta.');
    }
    if (
      payload.items.some((item) => (item.discount ?? 0) !== 0) &&
      !permissions.includes(SYSTEM_PERMISSIONS.SALES_DISCOUNT)
    ) {
      throw new ForbiddenException('No tiene permiso para aplicar descuentos manuales.');
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
    const { sale: saleResult } = await executeWithRetry(async () => {
      return this.client.$transaction(
        async (tx) => {
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
              throw new NotFoundException(`Cliente con id '${customerId}' no existe.`);
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
              throw new ConflictException(
                'No se encontró el cliente por defecto (Consumidor Final).',
              );
            }
          }

          // 2.2. Consecutivo de Factura
          const invoiceNumber = await this.saleRepository.generateNextInvoiceNumber(tx);

          // 2.3. Procesar Líneas y Asignación FEFO
          const saleId = crypto.randomUUID();
          const saleLines: SaleLine[] = [];
          const allLotAllocations: SaleLotAllocation[] = [];
          let costOfSalesCents = 0n;

          for (const item of payload.items) {
            const { product, factor, presentationName, requiredBaseUnits, ...resolved } =
              await this.resolveSaleItem(tx, item);
            let unitPrice = resolved.unitPrice;
            if (item.unitPriceOverride !== undefined) {
              unitPrice = item.unitPriceOverride;
            }

            const lineId = crypto.randomUUID();
            const lineAllocations: SaleLotAllocation[] = [];

            // Asignación FEFO con bloqueo concurrente
            // Bloquear lotes disponibles ordenados por vencimiento ascendente
            const availableLots = await this.inventoryLedger.lockFefoCandidates(
              tx,
              product.id,
              businessToday(),
            );

            const totalAvailable = availableLots.reduce((acc, l) => acc + l.current_quantity, 0);
            if (totalAvailable < requiredBaseUnits) {
              throw new InsufficientStockException(product.name, requiredBaseUnits, totalAvailable);
            }

            let remainingUnits = requiredBaseUnits;

            for (const lot of availableLots) {
              if (remainingUnits <= 0) break;

              const take = Math.min(lot.current_quantity, remainingUnits);
              // Descontar existencias del lote y registrar Kardex inmutable
              await this.inventoryLedger.changeLotQuantity(tx, lot.id, -take, {
                movementType: 'SALIDA_VENTA',
                productId: product.id,
                presentationId: item.presentationId || null,
                quantityBaseUnits: take,
                presentationFactorHistorical: factor,
                referenceDocumentType: 'SALE',
                referenceDocumentId: invoiceNumber,
                notes: `Venta POS ${invoiceNumber} - Despacho FEFO`,
                createdByUserId: auditCtx.userId || null,
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

            // Submayor de costos (ADR-005): FEFO eligió los lotes; el costo es el promedio vigente
            const lineCostCents = await this.inventoryLedger.valuation.issue(tx, {
              productId: product.id,
              quantityBaseUnits: requiredBaseUnits,
              movementType: 'SALE',
              sourceType: 'SALE',
              sourceId: saleId,
              userId: auditCtx.userId || null,
            });
            costOfSalesCents += lineCostCents;

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
              unitCostBase: centsToMoneyString(
                (lineCostCents * 2n + BigInt(requiredBaseUnits)) / (BigInt(requiredBaseUnits) * 2n),
              ),
              costValue: centsToMoneyString(lineCostCents),
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
              throw new BadRequestException(
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
            const saleAmountCents = parseMoneyToCents(
              new Prisma.Decimal(sale.total).toFixed(2),
              'Total de venta',
            );
            await this.cashService.recordMovementInTransaction(tx, {
              movementType: 'INGRESO_VENTA',
              amount: centsToMoneyString(saleAmountCents),
              paymentMethod: 'EFECTIVO',
              reason: `Venta mostrador comprobante ${sale.invoiceNumber}`,
              referenceDocumentType: 'SALE',
              referenceDocumentId: sale.invoiceNumber,
              createdByUserId: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
            });
          }

          // 2.7. Cuenta por Cobrar si es Crédito
          if (payload.paymentMethod === 'CREDITO') {
            const dueDate = calendarDate(addCalendarDays(businessToday(), 30));
            await this.receivablesLedger.openForSale(tx, {
              saleId: sale.id,
              customerId: customerId!,
              total: new Prisma.Decimal(sale.total).toFixed(2),
              dueDate,
              notes: payload.notes || `Venta a crédito comprobante ${sale.invoiceNumber}`,
            });
          }

          // 2.6.1. Contabilidad automática de partida doble (asiento automático)
          await this.accountingEngine.handleSaleConfirmed(
            {
              id: sale.id,
              invoiceNumber: sale.invoiceNumber,
              total: sale.total,
              subtotal: sale.subtotal,
              taxTotal: sale.taxTotal,
              discountTotal: sale.discountTotal,
              costOfSales: centsToMoneyString(costOfSalesCents),
              paymentMethod: sale.paymentMethod,
              bankAccountId: sale.bankAccountId ?? null,
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

          await this.auditService.recordEvent(
            {
              action: 'sales:sale_confirmed',
              entity: 'Sale',
              entityId: sale.id,
              userId: auditCtx.userId || null,
              details: {
                invoiceNumber: sale.invoiceNumber,
                total: sale.total,
                paymentMethod: sale.paymentMethod,
                itemsCount: sale.lines.length,
              },
              ipAddress: auditCtx.ipAddress || null,
              correlationId: auditCtx.correlationId || null,
            },
            tx,
          );

          return { sale: dto, replayed: false };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    });

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
      throw new BadRequestException('El motivo de anulación es obligatorio');
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
      return this.client.$transaction(
        async (tx) => {
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
          // Anular con abonos vigentes dejaría dinero recibido sin devolver ni reversar
          if (sale.paymentMethod === 'CREDITO') {
            // Mismo bloqueo de fila que toma el registro de abonos: serializa abono y anulación
            await tx.$queryRaw`SELECT id FROM receivables WHERE sale_id = ${id}::uuid FOR UPDATE`;
            const activePayments = await tx.receivablePayment.count({
              where: { receivable: { saleId: id }, isReversed: false },
            });
            if (activePayments > 0) {
              throw new SaleHasReceivablePaymentsException(sale.invoiceNumber, activePayments);
            }
          }
          sale.cancel();
          await this.saleRepository.save(sale, tx);

          // Reintegrar unidades a los lotes originales exactos
          for (const line of sale.lines) {
            const restoredBaseUnits = line.lotAllocations.reduce(
              (sum, alloc) => sum + alloc.quantityBaseUnits,
              0,
            );
            for (const alloc of line.lotAllocations) {
              await this.inventoryLedger.changeLotQuantity(
                tx,
                alloc.lotId,
                alloc.quantityBaseUnits,
                {
                  movementType: 'DEVOLUCION_CLIENTE',
                  productId: line.productId,
                  presentationId: line.presentationId || null,
                  quantityBaseUnits: alloc.quantityBaseUnits,
                  presentationFactorHistorical: line.presentationFactorHistorical,
                  referenceDocumentType: 'SALE_CANCEL',
                  referenceDocumentId: sale.invoiceNumber,
                  notes: `Anulación venta ${sale.invoiceNumber}. Motivo: ${trimmedReason}`,
                  createdByUserId: auditCtx.userId || null,
                },
              );
            }
            // Vuelve al costo exacto con que salió: el asiento de la venta se reversa completo
            if (restoredBaseUnits > 0) {
              await this.inventoryLedger.valuation.receive(tx, {
                productId: line.productId,
                quantityBaseUnits: restoredBaseUnits,
                valueCents: await this.recordedLineCost(tx, line, restoredBaseUnits),
                movementType: 'SALE_CANCELLATION',
                sourceType: 'SALE_CANCEL',
                sourceId: sale.id,
                userId: auditCtx.userId || null,
              });
            }
          }

          // Revertir en caja si fue en efectivo
          if (sale.paymentMethod === 'EFECTIVO') {
            const saleAmountCents = parseMoneyToCents(
              new Prisma.Decimal(sale.total).toFixed(2),
              'Total de venta',
            );
            await this.cashService.recordMovementInTransaction(tx, {
              movementType: 'EGRESO_MANUAL',
              amount: centsToMoneyString(saleAmountCents),
              paymentMethod: 'EFECTIVO',
              reason: `Reversión por anulación de venta ${sale.invoiceNumber}: ${trimmedReason}`,
              referenceDocumentType: 'SALE_CANCEL',
              referenceDocumentId: sale.invoiceNumber,
              createdByUserId: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
            });
          }
          if (sale.paymentMethod === 'TRANSFERENCIA') {
            if (!sale.bankAccountId)
              throw new ConflictException(
                'La venta por transferencia no conserva una cuenta bancaria.',
              );
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
            await this.receivablesLedger.cancelForSale(tx, sale.id, trimmedReason);
          }

          // Reversión contable automática
          await this.accountingEngine.handleSaleCancelled(
            sale.id,
            trimmedReason,
            auditCtx.userId || undefined,
            tx,
          );

          await this.auditService.recordEvent(
            {
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
            },
            tx,
          );

          return sale.toDto();
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    });

    return cancelledDto;
  }
}
