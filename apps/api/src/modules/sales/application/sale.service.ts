import { Inject, Injectable, Optional } from '@nestjs/common';
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
} from '../domain/sale.exceptions';
import { IdempotencyService } from '../infrastructure/idempotency.service';
import { AuditService } from '../../audit/application/services/audit.service';

export interface AuditContext {
  userId?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class SaleService {
  private readonly client: PrismaClient;

  constructor(
    @Inject(SALE_REPOSITORY)
    private readonly saleRepository: ISaleRepository,
    private readonly idempotencyService: IdempotencyService,
    @Optional() customClient?: PrismaClient,
    @Optional() private readonly auditService?: AuditService
  ) {
    this.client = customClient ?? prisma;
  }

  public async confirmSale(
    payload: ConfirmSalePayload,
    auditCtx: AuditContext,
    idempotencyKey?: string
  ): Promise<SaleDto> {
    if (!payload.items || payload.items.length === 0) {
      throw new Error('La venta debe incluir al menos un producto.');
    }

    // 1. Verificación de Idempotencia
    let requestHash = '';
    if (idempotencyKey && idempotencyKey.trim()) {
      requestHash = this.idempotencyService.computeHash(payload);
      const cached = await this.idempotencyService.getRecord(idempotencyKey.trim(), requestHash);
      if (cached) {
        return cached.responseBody as SaleDto;
      }
    }

    // 2. Transacción ACID completa en PostgreSQL
    const saleResult = await this.client.$transaction(async (tx) => {
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
            throw new Error(`La presentación '${presentation.name}' no está habilitada para ventas.`);
          }
          factor = presentation.conversionFactor;
          unitPrice = Number(presentation.price);
          presentationName = presentation.name;
        }

        if (item.unitPriceOverride !== undefined && item.unitPriceOverride >= 0) {
          unitPrice = item.unitPriceOverride;
        }

        const requiredBaseUnits = Math.round(item.quantityCommercial * factor);
        const lineId = crypto.randomUUID();
        const lineAllocations: SaleLotAllocation[] = [];

        // Asignación FEFO con bloqueo concurrente
        if (product.requiresLotControl) {
          // Bloquear lotes disponibles ordenados por vencimiento ascendente
          const availableLots = await tx.$queryRaw<Array<{
            id: string;
            lot_number: string;
            expiration_date: Date;
            current_quantity: number;
          }>>`
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
        lines: saleLines,
        amountPaid: payload.amountPaid,
        notes: payload.notes,
        createdById: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
      });

      // 2.5. Persistir Venta y Asignaciones
      await this.saleRepository.save(sale, tx);

      // 2.6. Movimiento de Caja si es Efectivo
      if (payload.paymentMethod === 'EFECTIVO') {
        const lastRows = await tx.$queryRaw<Array<{ balance_after: any }>>`
          SELECT balance_after
          FROM cash_movements
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `;

        const currentBalance = lastRows.length > 0 ? Number(lastRows[0].balance_after) : 0;
        const newBalance = currentBalance + sale.total;

        await tx.cashMovement.create({
          data: {
            movementType: 'INGRESO_VENTA',
            amount: new Prisma.Decimal(sale.total),
            paymentMethod: 'EFECTIVO',
            reason: `Venta mostrador comprobante ${sale.invoiceNumber}`,
            referenceDocumentType: 'SALE',
            referenceDocumentId: sale.invoiceNumber,
            balanceAfter: new Prisma.Decimal(newBalance),
            createdByUserId: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
          },
        });
      }

      const dto = sale.toDto();

      // 2.7. Guardar registro de Idempotencia dentro de la transacción
      if (idempotencyKey && idempotencyKey.trim()) {
        await this.idempotencyService.saveRecord(
          {
            key: idempotencyKey.trim(),
            userId: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
            endpoint: '/api/v1/sales/confirm',
            requestHash,
            responseStatus: 201,
            responseBody: dto,
            ttlHours: 24,
          },
          tx
        );
      }

      return dto;
    });

    // 3. Auditoría asíncrona fuera de la transacción
    if (this.auditService) {
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

  public async cancelSale(
    id: string,
    reason: string,
    auditCtx: AuditContext
  ): Promise<SaleDto> {
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

    // Transacción ACID de reversión
    const cancelledDto = await this.client.$transaction(async (tx) => {
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
        const lastRows = await tx.$queryRaw<Array<{ balance_after: any }>>`
          SELECT balance_after
          FROM cash_movements
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `;

        const currentBalance = lastRows.length > 0 ? Number(lastRows[0].balance_after) : 0;
        const newBalance = Math.max(0, currentBalance - sale.total);

        await tx.cashMovement.create({
          data: {
            movementType: 'EGRESO_MANUAL',
            amount: new Prisma.Decimal(sale.total),
            paymentMethod: 'EFECTIVO',
            reason: `Reversión por anulación de venta ${sale.invoiceNumber}: ${trimmedReason}`,
            referenceDocumentType: 'SALE_CANCEL',
            referenceDocumentId: sale.invoiceNumber,
            balanceAfter: new Prisma.Decimal(newBalance),
            createdByUserId: auditCtx.userId || '00000000-0000-0000-0000-000000000000',
          },
        });
      }

      return sale.toDto();
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
