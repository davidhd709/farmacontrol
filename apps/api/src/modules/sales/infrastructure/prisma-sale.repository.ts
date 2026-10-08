import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import { ISaleRepository } from '../domain/sale.repository';
import { Sale, SaleLine, SaleLotAllocation } from '../domain/sale.entity';
import { SaleQueryFilters } from '@farmacia/contracts';

@Injectable()
export class PrismaSaleRepository implements ISaleRepository {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  async save(sale: Sale, tx?: any): Promise<void> {
    const db = tx ?? this.client;

    const existing = await db.sale.findUnique({
      where: { id: sale.id },
      select: { id: true },
    });

    if (existing) {
      // Actualizar estado (ej. al anular)
      await db.sale.update({
        where: { id: sale.id },
        data: {
          status: sale.status,
          updatedAt: sale.updatedAt,
        },
      });
      return;
    }

    // Creación de venta completa
    await db.sale.create({
      data: {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        customerId: sale.customerId,
        status: sale.status,
        paymentMethod: sale.paymentMethod,
        bankAccountId: sale.bankAccountId,
        subtotal: new Prisma.Decimal(sale.subtotal),
        taxTotal: new Prisma.Decimal(sale.taxTotal),
        discountTotal: new Prisma.Decimal(sale.discountTotal),
        total: new Prisma.Decimal(sale.total),
        amountPaid: new Prisma.Decimal(sale.amountPaid),
        changeGiven: new Prisma.Decimal(sale.changeGiven),
        notes: sale.notes,
        createdById: sale.createdById,
        createdAt: sale.createdAt,
        updatedAt: sale.updatedAt,
        lines: {
          create: sale.lines.map((l) => ({
            id: l.id,
            productId: l.productId,
            presentationId: l.presentationId || null,
            presentationFactorHistorical: l.presentationFactorHistorical,
            quantityCommercial: new Prisma.Decimal(l.quantityCommercial),
            quantityBaseUnits: l.quantityBaseUnits,
            unitPrice: new Prisma.Decimal(l.unitPrice),
            unitCost: l.unitCost !== null ? new Prisma.Decimal(l.unitCost) : null,
            discount: new Prisma.Decimal(l.discount),
            subtotal: new Prisma.Decimal(l.subtotal),
            taxRate: new Prisma.Decimal(l.taxRate),
            taxAmount: new Prisma.Decimal(l.taxAmount),
            total: new Prisma.Decimal(l.total),
            createdAt: l.lotAllocations[0]?.lotNumber ? new Date() : undefined,
          })),
        },
      },
    });

    // Guardar las asignaciones de lotes asociadas
    for (const line of sale.lines) {
      if (line.lotAllocations && line.lotAllocations.length > 0) {
        for (const alloc of line.lotAllocations) {
          await db.saleLotAllocation.create({
            data: {
              id: alloc.id,
              saleId: sale.id,
              saleLineId: line.id,
              lotId: alloc.lotId,
              quantityBaseUnits: alloc.quantityBaseUnits,
            },
          });
        }
      }
    }
  }

  async findById(id: string, tx?: any): Promise<Sale | null> {
    const db = tx ?? this.client;
    const raw = await db.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        createdByUser: true,
        lines: {
          include: {
            product: true,
            presentation: true,
            lotAllocations: {
              include: {
                lot: true,
              },
            },
          },
        },
      },
    });
    if (!raw) return null;
    return this.mapToDomain(raw);
  }

  async findByInvoiceNumber(invoiceNumber: string, tx?: any): Promise<Sale | null> {
    const db = tx ?? this.client;
    const raw = await db.sale.findUnique({
      where: { invoiceNumber: invoiceNumber.trim().toUpperCase() },
      include: {
        customer: true,
        createdByUser: true,
        lines: {
          include: {
            product: true,
            presentation: true,
            lotAllocations: {
              include: {
                lot: true,
              },
            },
          },
        },
      },
    });
    if (!raw) return null;
    return this.mapToDomain(raw);
  }

  async findAll(filters: SaleQueryFilters): Promise<{ items: Sale[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = {};

    if (filters.invoiceNumber && filters.invoiceNumber.trim()) {
      where.invoiceNumber = { contains: filters.invoiceNumber.trim(), mode: 'insensitive' };
    }
    if (filters.customerId) {
      where.customerId = filters.customerId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) {
        where.createdAt.gte = new Date(filters.fromDate);
      }
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const [rawItems, total] = await Promise.all([
      this.client.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: true,
          createdByUser: true,
          lines: {
            include: {
              product: true,
              presentation: true,
              lotAllocations: {
                include: {
                  lot: true,
                },
              },
            },
          },
        },
      }),
      this.client.sale.count({ where }),
    ]);

    return {
      items: rawItems.map((r: any) => this.mapToDomain(r)),
      total,
    };
  }

  async generateNextInvoiceNumber(tx?: any): Promise<string> {
    const db = tx ?? this.client;
    const count = await db.sale.count();
    const nextNumber = count + 1;
    return `FAC-${String(nextNumber).padStart(6, '0')}`;
  }

  private mapToDomain(raw: any): Sale {
    const lines = raw.lines.map((l: any) => {
      const lotAllocations = (l.lotAllocations || []).map((a: any) =>
        SaleLotAllocation.create({
          id: a.id,
          saleId: a.saleId,
          saleLineId: a.saleLineId,
          lotId: a.lotId,
          quantityBaseUnits: a.quantityBaseUnits,
          lotNumber: a.lot?.lotNumber,
          expirationDate: a.lot?.expirationDate
            ? new Date(a.lot.expirationDate).toISOString().split('T')[0]
            : undefined,
          createdAt: a.createdAt,
        }),
      );

      return SaleLine.reconstitute({
        id: l.id,
        saleId: l.saleId,
        productId: l.productId,
        productCode: l.product?.code,
        productName: l.product?.name,
        presentationId: l.presentationId,
        presentationName: l.presentation?.name,
        presentationFactorHistorical: l.presentationFactorHistorical,
        quantityCommercial: Number(l.quantityCommercial),
        quantityBaseUnits: l.quantityBaseUnits,
        unitPrice: Number(l.unitPrice),
        unitCost: l.unitCost !== null ? Number(l.unitCost) : null,
        discount: Number(l.discount),
        subtotal: Number(l.subtotal),
        taxRate: Number(l.taxRate),
        taxAmount: Number(l.taxAmount),
        total: Number(l.total),
        lotAllocations,
        createdAt: l.createdAt,
      });
    });

    return Sale.reconstitute({
      id: raw.id,
      invoiceNumber: raw.invoiceNumber,
      customerId: raw.customerId,
      customerName: raw.customer?.name,
      customerDocument: raw.customer?.documentNumber,
      status: raw.status as any,
      paymentMethod: raw.paymentMethod as any,
      bankAccountId: raw.bankAccountId,
      subtotal: Number(raw.subtotal),
      taxTotal: Number(raw.taxTotal),
      discountTotal: Number(raw.discountTotal),
      total: Number(raw.total),
      amountPaid: Number(raw.amountPaid),
      changeGiven: Number(raw.changeGiven),
      notes: raw.notes,
      createdById: raw.createdById,
      createdByUsername: raw.createdByUser?.username,
      lines,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
