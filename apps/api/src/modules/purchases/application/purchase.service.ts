import { businessToday } from '../../../common/utils/business-date';
import {
  Inject,
  Injectable,
  Optional,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { prisma, PrismaClient } from '@farmacia/database';
import {
  PurchaseDto,
  ReceivePurchasePayload,
  PurchaseQueryFilters,
  PaginatedResponse,
  InventoryControlMode,
} from '@farmacia/contracts';
import { IPurchaseRepository, PURCHASE_REPOSITORY } from '../domain/purchase.repository';
import { Purchase, PurchaseLine } from '../domain/purchase.entity';
import {
  PurchaseNotFoundException,
  SupplierNotActiveException,
  ExpiredLotDateException,
} from '../domain/purchase.exceptions';
import { AuditService } from '../../audit/application/services/audit.service';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';

export interface AuditContext {
  userId?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class PurchaseService {
  private readonly client: PrismaClient;

  constructor(
    @Inject(PURCHASE_REPOSITORY)
    private readonly purchaseRepository: IPurchaseRepository,
    private readonly accountingEngine: AccountingEngineService,
    private readonly auditService: AuditService,
    @Optional() customClient?: PrismaClient,
  ) {
    this.client = customClient ?? prisma;
  }

  async receivePurchase(input: ReceivePurchasePayload, auditCtx?: AuditContext): Promise<Purchase> {
    // 1. Validar Proveedor
    const supplier = await this.client.supplier.findUnique({
      where: { id: input.supplierId },
    });
    if (!supplier) {
      throw new NotFoundException(`Proveedor con ID "${input.supplierId}" no encontrado`);
    }
    if (!supplier.isActive) {
      throw new SupplierNotActiveException(input.supplierId);
    }

    // 2. Obtener Ubicación por Defecto
    const defaultLocation = await this.client.location.findFirst({
      where: { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!defaultLocation) {
      throw new BadRequestException(
        'No existe ninguna ubicación de inventario activa para recepcionar mercancía',
      );
    }

    if (!input.lines || input.lines.length === 0) {
      throw new BadRequestException('La compra debe contener al menos un producto');
    }

    // 3. Validar cada entrada contra el modo de control persistido del producto.
    const purchaseLines: PurchaseLine[] = [];

    for (const lineInput of input.lines) {
      const product = await this.client.product.findUnique({
        where: { id: lineInput.productId },
      });
      if (!product) {
        throw new NotFoundException(`Producto con ID "${lineInput.productId}" no encontrado`);
      }
      if (!product.isActive) {
        throw new BadRequestException(`El producto "${product.name}" está inactivo`);
      }

      let conversionFactor = 1;
      let presentationName: string | undefined;

      if (lineInput.presentationId) {
        const pres = await this.client.productPresentation.findUnique({
          where: { id: lineInput.presentationId },
        });
        if (!pres || pres.productId !== product.id) {
          throw new BadRequestException(
            `La presentación "${lineInput.presentationId}" no es válida para el producto "${product.name}"`,
          );
        }
        if (!pres.isActive) {
          throw new BadRequestException(
            `La presentación "${pres.name}" del producto "${product.name}" está inactiva`,
          );
        }
        if (!pres.purchaseEnabled) {
          throw new BadRequestException(
            `La presentación "${pres.name}" del producto "${product.name}" no está habilitada para compras`,
          );
        }
        conversionFactor = pres.conversionFactor;
        presentationName = pres.name;
      }
      const commercialQty = Number(lineInput.quantityCommercial);
      const unitCost = Number(lineInput.unitCost);
      const locationId = lineInput.locationId || defaultLocation.id;
      const location = await this.client.location.findUnique({ where: { id: locationId } });
      if (!location || !location.isActive) {
        throw new BadRequestException(`La ubicación "${locationId}" no existe o está inactiva.`);
      }

      const controlMode = product.inventoryControlMode as InventoryControlMode;
      const hasLot = Boolean(lineInput.lotNumber?.trim());
      const hasExpiration = Boolean(lineInput.expirationDate?.trim());
      const hasSerials = lineInput.serialNumbers !== undefined;
      let expirationDate: Date | null = null;
      if (hasExpiration) {
        expirationDate = new Date(lineInput.expirationDate!);
        if (isNaN(expirationDate.getTime())) {
          throw new BadRequestException(
            `Fecha de vencimiento inválida para el producto "${product.name}".`,
          );
        }
      }

      if (controlMode === 'SERVICE') {
        throw new BadRequestException(
          `El producto SERVICE "${product.name}" no se puede recibir como inventario.`,
        );
      }
      if (controlMode === 'LOT_EXPIRY') {
        if (!hasLot || !expirationDate || hasSerials) {
          throw new BadRequestException(
            `El producto "${product.name}" requiere lote y vencimiento, y no recibe serialNumbers.`,
          );
        }
        if (expirationDate.toISOString().slice(0, 10) <= businessToday()) {
          throw new ExpiredLotDateException(lineInput.lotNumber!, lineInput.expirationDate!);
        }
      } else if (controlMode === 'LOT') {
        if (!hasLot || hasExpiration || hasSerials) {
          throw new BadRequestException(
            `El producto "${product.name}" requiere lote, prohíbe vencimiento y no recibe serialNumbers.`,
          );
        }
      } else if (controlMode === 'SIMPLE') {
        if (hasLot || hasExpiration || hasSerials) {
          throw new BadRequestException(
            `El producto SIMPLE "${product.name}" prohíbe lote, vencimiento y serialNumbers.`,
          );
        }
      } else if (controlMode === 'SERIAL') {
        if (conversionFactor !== 1) {
          throw new BadRequestException(
            `El producto SERIAL "${product.name}" solo permite presentaciones de factor 1.`,
          );
        }
        if (hasLot || hasExpiration || !lineInput.serialNumbers) {
          throw new BadRequestException(
            `El producto SERIAL "${product.name}" requiere serialNumbers y prohíbe lote y vencimiento.`,
          );
        }
        const units = commercialQty * conversionFactor;
        if (!Number.isInteger(units) || lineInput.serialNumbers.length !== units) {
          throw new BadRequestException(
            `La cantidad de series debe ser igual a las unidades base recibidas para "${product.name}".`,
          );
        }
        if (
          new Set(lineInput.serialNumbers.map((serial) => serial.trim().toUpperCase())).size !==
          lineInput.serialNumbers.length
        ) {
          throw new BadRequestException(
            `No se permiten series repetidas en la recepción de "${product.name}".`,
          );
        }
        for (const serialNumber of lineInput.serialNumbers) {
          purchaseLines.push(
            PurchaseLine.create({
              productId: product.id,
              productName: product.name,
              presentationId: lineInput.presentationId,
              presentationName,
              lotNumber: serialNumber,
              expirationDate: null,
              quantityCommercial: 1,
              conversionFactor: 1,
              unitCost,
              locationId,
              controlMode,
            }),
          );
        }
        continue;
      }

      purchaseLines.push(
        PurchaseLine.create({
          productId: product.id,
          productName: product.name,
          presentationId: lineInput.presentationId,
          presentationName,
          lotNumber: lineInput.lotNumber,
          expirationDate,
          quantityCommercial: commercialQty,
          conversionFactor,
          unitCost,
          locationId,
          controlMode,
        }),
      );
    }

    // 4. Crear entidad Purchase
    const purchaseDate = new Date(input.purchaseDate);
    if (isNaN(purchaseDate.getTime())) {
      throw new BadRequestException('La fecha de compra no es válida');
    }

    let dueDate: Date | null = null;
    if (input.dueDate) {
      const parsedDueDate = new Date(input.dueDate);
      if (!isNaN(parsedDueDate.getTime())) {
        dueDate = parsedDueDate;
      }
    }

    const purchase = Purchase.create({
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierTaxId: supplier.taxId,
      invoiceNumber: input.invoiceNumber,
      purchaseDate,
      dueDate,
      paymentCondition: input.paymentCondition || null,
      notes: input.notes,
      receivedByUserId: auditCtx?.userId ?? null,
      lines: purchaseLines,
    });

    // 5. Guardar transaccionalmente
    const locationId = input.lines[0]?.locationId || defaultLocation.id;
    const savedPurchase = await this.purchaseRepository.saveTransactional(
      purchase,
      locationId,
      auditCtx?.userId ?? null,
      async (tx, p) => {
        await this.accountingEngine.handlePurchaseReceived(
          {
            id: p.id,
            invoiceNumber: p.invoiceNumber,
            supplierName: p.supplierName,
            totalAmount: p.totalAmount,
            purchaseDate: p.purchaseDate,
            receivedByUserId: p.receivedByUserId,
          },
          tx,
        );
        await this.auditService.recordEvent(
          {
            action: 'purchases:purchase_received',
            entity: 'Purchase',
            entityId: p.id,
            userId: auditCtx?.userId || null,
            ipAddress: auditCtx?.ipAddress || null,
            correlationId: auditCtx?.correlationId || null,
            details: {
              supplierId: supplier.id,
              supplierName: supplier.name,
              invoiceNumber: p.invoiceNumber,
              totalAmount: p.totalAmount,
              linesCount: p.lines.length,
            },
          },
          tx,
        );
      },
    );

    return savedPurchase;
  }

  async getPurchaseById(id: string): Promise<Purchase> {
    const purchase = await this.purchaseRepository.findById(id);
    if (!purchase) {
      throw new PurchaseNotFoundException(id);
    }
    return purchase;
  }

  async getPurchases(filters: PurchaseQueryFilters): Promise<PaginatedResponse<PurchaseDto>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

    const result = await this.purchaseRepository.findAll({
      ...filters,
      page,
      pageSize,
    });

    return {
      items: result.items.map((p) => p.toDto()),
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
    };
  }
}
