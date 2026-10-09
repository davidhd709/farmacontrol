import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import { IPurchaseRepository } from '../domain/purchase.repository';
import { Purchase, PurchaseLine } from '../domain/purchase.entity';
import {
  DuplicatePurchaseInvoiceException,
  LotConflictException,
} from '../domain/purchase.exceptions';

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);
import { PurchaseQueryFilters } from '@farmacia/contracts';

@Injectable()
export class PrismaPurchaseRepository implements IPurchaseRepository {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  async saveTransactional(
    purchase: Purchase,
    defaultLocationId: string,
    actorUserId: string | null,
    afterSaveTx?: (tx: any, savedPurchase: Purchase) => Promise<void>,
  ): Promise<Purchase> {
    try {
      return await this.saveInTransaction(purchase, defaultLocationId, actorUserId, afterSaveTx);
    } catch (error) {
      // UNIQUE (supplier_id, invoice_number): también cubre dos recepciones simultáneas
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicatePurchaseInvoiceException(purchase.invoiceNumber);
      }
      throw error;
    }
  }

  private async saveInTransaction(
    purchase: Purchase,
    defaultLocationId: string,
    actorUserId: string | null,
    afterSaveTx?: (tx: any, savedPurchase: Purchase) => Promise<void>,
  ): Promise<Purchase> {
    return await this.client.$transaction(async (tx) => {
      // 1. Crear registro de la Compra
      await tx.purchase.create({
        data: {
          id: purchase.id,
          supplierId: purchase.supplierId,
          invoiceNumber: purchase.invoiceNumber,
          purchaseDate: purchase.purchaseDate,
          totalAmount: new Prisma.Decimal(purchase.totalAmount),
          status: purchase.status,
          notes: purchase.notes,
          receivedByUserId: purchase.receivedByUserId,
          createdAt: purchase.createdAt,
          updatedAt: purchase.updatedAt,
        },
      });

      // Crear cuenta por pagar (Payable) vinculada a la factura de compra
      // Conforme a MODULO_CONTABILIDAD_FARMACIA.md: registrar la compra y pagarla son eventos distintos.
      // Toda compra causa una obligación en estado PENDIENTE. Si es CONTADO, vence en la misma fecha de compra.
      const payableDueDate = purchase.dueDate || purchase.purchaseDate;
      await tx.payable.create({
        data: {
          purchaseId: purchase.id,
          supplierId: purchase.supplierId,
          totalAmount: new Prisma.Decimal(purchase.totalAmount),
          amountPaid: new Prisma.Decimal(0),
          balance: new Prisma.Decimal(purchase.totalAmount),
          status: 'PENDIENTE',
          dueDate: payableDueDate,
          notes: purchase.notes,
        },
      });

      // 2. Procesar cada línea de compra y afectar inventario
      for (const line of purchase.lines) {
        // Buscar y bloquear el lote en la ubicación
        const existingLots = await tx.$queryRaw<
          Array<{ id: string; expiration_date: Date; is_active: boolean }>
        >`
          SELECT id, expiration_date, is_active
          FROM inventory_lots
          WHERE product_id = ${line.productId}::uuid
            AND location_id = ${defaultLocationId}::uuid
            AND lot_number = ${line.lotNumber}
          FOR UPDATE
        `;

        let lot: { id: string };
        let newBalance = line.quantityBaseUnits;
        if (existingLots.length > 0) {
          const existing = existingLots[0];
          // Un lote es un único vencimiento: la recepción no lo reescribe ni lo reactiva
          if (toDateOnly(existing.expiration_date) !== toDateOnly(line.expirationDate)) {
            throw new LotConflictException(
              `El lote "${line.lotNumber}" ya existe con vencimiento ${toDateOnly(existing.expiration_date)}; la factura indica ${toDateOnly(line.expirationDate)}.`,
            );
          }
          if (!existing.is_active) {
            throw new LotConflictException(
              `El lote "${line.lotNumber}" está inactivo; no se puede recibir mercancía en él.`,
            );
          }
          const updatedLot = await tx.inventoryLot.update({
            where: { id: existing.id },
            data: {
              currentQuantity: { increment: line.quantityBaseUnits },
            },
          });
          newBalance = updatedLot.currentQuantity;
          lot = updatedLot;
          line.setLotId(existing.id);
        } else {
          lot = await tx.inventoryLot.create({
            data: {
              id: line.lotId,
              productId: line.productId,
              locationId: defaultLocationId,
              lotNumber: line.lotNumber,
              expirationDate: line.expirationDate,
              currentQuantity: line.quantityBaseUnits,
              isActive: true,
            },
          });
          line.setLotId(lot.id);
        }

        const factorHistorical = line.conversionFactor;

        // Insertar línea de compra
        await tx.purchaseLine.create({
          data: {
            id: line.id,
            purchaseId: purchase.id,
            productId: line.productId,
            presentationId: line.presentationId,
            lotId: lot.id,
            quantityCommercial: new Prisma.Decimal(line.quantityCommercial),
            presentationFactorHistorical: factorHistorical,
            quantityBaseUnits: line.quantityBaseUnits,
            unitCost: new Prisma.Decimal(line.unitCost),
            subtotal: new Prisma.Decimal(line.subtotal),
            lotNumber: line.lotNumber,
            expirationDate: line.expirationDate,
            createdAt: line.createdAt,
          },
        });

        // Insertar movimiento inmutable de Kardex

        await tx.inventoryMovement.create({
          data: {
            movementType: 'ENTRADA_COMPRA',
            productId: line.productId,
            lotId: lot.id,
            presentationId: line.presentationId,
            quantityBaseUnits: line.quantityBaseUnits,
            presentationFactorHistorical: factorHistorical,
            quantityCommercial: new Prisma.Decimal(line.quantityCommercial),
            balanceAfterBaseUnits: newBalance,
            referenceDocumentType: 'COMPRA',
            referenceDocumentId: purchase.id,
            notes: `Recepción factura ${purchase.invoiceNumber} - Lote ${line.lotNumber}`,
            createdByUserId: actorUserId,
          },
        });
      }

      const result = await this.findByIdWithTx(purchase.id, tx);
      if (!result) {
        throw new Error('Error al recargar la compra recién registrada');
      }

      if (afterSaveTx) {
        await afterSaveTx(tx, result);
      }

      return result;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  async findById(id: string): Promise<Purchase | null> {
    return this.findByIdWithTx(id, this.client);
  }

  async findAll(filters: PurchaseQueryFilters): Promise<{ items: Purchase[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (filters.supplierId) {
      where.supplierId = filters.supplierId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.invoiceNumber) {
      where.invoiceNumber = { contains: filters.invoiceNumber.trim(), mode: 'insensitive' };
    }
    if (filters.fromDate || filters.toDate) {
      where.purchaseDate = {};
      if (filters.fromDate) {
        where.purchaseDate.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        where.purchaseDate.lte = new Date(filters.toDate);
      }
    }

    const [rawItems, total] = await Promise.all([
      this.client.purchase.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { purchaseDate: 'desc' },
        include: {
          supplier: true,
          receivedByUser: true,
          payable: true,
          lines: {
            include: {
              product: true,
              presentation: true,
            },
          },
        },
      }),
      this.client.purchase.count({ where }),
    ]);

    return {
      items: rawItems.map((r: any) => this.mapToDomain(r)),
      total,
    };
  }

  private async findByIdWithTx(
    id: string,
    prismaClient: PrismaClient | Prisma.TransactionClient
  ): Promise<Purchase | null> {
    const raw = await prismaClient.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        receivedByUser: true,
        payable: true,
        lines: {
          include: {
            product: true,
            presentation: true,
          },
        },
      },
    });

    if (!raw) return null;
    return this.mapToDomain(raw);
  }

  private mapToDomain(raw: any): Purchase {
    const lines = (raw.lines || []).map((l: any) =>
      PurchaseLine.reconstitute({
        id: l.id,
        purchaseId: l.purchaseId,
        productId: l.productId,
        productName: l.product?.name,
        presentationId: l.presentationId,
        presentationName: l.presentation?.name,
        lotId: l.lotId,
        lotNumber: l.lotNumber,
        expirationDate: l.expirationDate,
        quantityCommercial: Number(l.quantityCommercial),
        conversionFactor: l.presentationFactorHistorical,
        quantityBaseUnits: l.quantityBaseUnits,
        unitCost: Number(l.unitCost),
        subtotal: Number(l.subtotal),
        createdAt: l.createdAt,
      })
    );

    const dueDate = raw.payable?.dueDate ?? null;
    let paymentCondition: string | null = null;
    if (raw.notes && raw.notes.includes('Condición: Contado')) {
      paymentCondition = 'CONTADO';
    } else if (raw.notes && raw.notes.includes('Condición: Crédito')) {
      paymentCondition = 'CREDITO';
    } else if (dueDate && raw.purchaseDate && new Date(dueDate).getTime() <= new Date(raw.purchaseDate).getTime()) {
      paymentCondition = 'CONTADO';
    } else if (dueDate && raw.purchaseDate && new Date(dueDate).getTime() > new Date(raw.purchaseDate).getTime()) {
      paymentCondition = 'CREDITO';
    } else if (raw.payable) {
      paymentCondition = raw.payable.status === 'PAGADA' ? 'CONTADO' : 'CREDITO';
    }

    return Purchase.reconstitute({
      id: raw.id,
      supplierId: raw.supplierId,
      supplierName: raw.supplier?.name,
      supplierTaxId: raw.supplier?.taxId,
      invoiceNumber: raw.invoiceNumber,
      purchaseDate: raw.purchaseDate,
      dueDate,
      paymentCondition,
      totalAmount: Number(raw.totalAmount),
      status: raw.status,
      notes: raw.notes,
      receivedByUserId: raw.receivedByUserId,
      receivedByUsername: raw.receivedByUser?.username,
      lines,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
