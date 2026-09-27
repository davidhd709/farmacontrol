import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import { IPurchaseRepository } from '../domain/purchase.repository';
import { Purchase, PurchaseLine } from '../domain/purchase.entity';
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
    actorUserId: string | null
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
      const payableDueDate = purchase.dueDate || purchase.purchaseDate;
      const isContado = purchase.paymentCondition === 'CONTADO';
      await tx.payable.create({
        data: {
          purchaseId: purchase.id,
          supplierId: purchase.supplierId,
          totalAmount: new Prisma.Decimal(purchase.totalAmount),
          amountPaid: new Prisma.Decimal(isContado ? purchase.totalAmount : 0),
          balance: new Prisma.Decimal(isContado ? 0 : purchase.totalAmount),
          status: isContado ? 'PAGADA' : 'PENDIENTE',
          dueDate: payableDueDate,
          notes: purchase.notes,
        },
      });

      // 2. Procesar cada línea de compra y afectar inventario
      for (const line of purchase.lines) {
        // Buscar o crear lote en la ubicación
        let lot = await tx.inventoryLot.findUnique({
          where: {
            productId_locationId_lotNumber: {
              productId: line.productId,
              locationId: defaultLocationId,
              lotNumber: line.lotNumber,
            },
          },
        });

        let newBalance = line.quantityBaseUnits;
        if (lot) {
          const updatedLot = await tx.inventoryLot.update({
            where: { id: lot.id },
            data: {
              currentQuantity: { increment: line.quantityBaseUnits },
              expirationDate: line.expirationDate,
              isActive: true,
            },
          });
          newBalance = updatedLot.currentQuantity;
          line.setLotId(lot.id);
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

        // Insertar línea de compra
        await tx.purchaseLine.create({
          data: {
            id: line.id,
            purchaseId: purchase.id,
            productId: line.productId,
            presentationId: line.presentationId,
            lotId: lot.id,
            quantityCommercial: new Prisma.Decimal(line.quantityCommercial),
            quantityBaseUnits: line.quantityBaseUnits,
            unitCost: new Prisma.Decimal(line.unitCost),
            subtotal: new Prisma.Decimal(line.subtotal),
            lotNumber: line.lotNumber,
            expirationDate: line.expirationDate,
            createdAt: line.createdAt,
          },
        });

        // Insertar movimiento inmutable de Kardex
        const factorHistorical =
          line.quantityCommercial > 0
            ? Math.round(line.quantityBaseUnits / line.quantityCommercial)
            : 1;

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
      return result;
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
        quantityBaseUnits: l.quantityBaseUnits,
        unitCost: Number(l.unitCost),
        subtotal: Number(l.subtotal),
        createdAt: l.createdAt,
      })
    );

    let dueDate = raw.payable?.dueDate ?? null;
    let paymentCondition = raw.payable ? (raw.payable.status === 'PAGADA' ? 'CONTADO' : 'CREDITO') : null;

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
