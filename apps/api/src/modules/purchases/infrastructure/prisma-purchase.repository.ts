import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import { IPurchaseRepository } from '../domain/purchase.repository';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PayablesLedger } from '../../payables/application/payables-ledger';
import { InventoryLedger } from '../../inventory/application/inventory-ledger';
import { parseMoneyToCents } from '../../treasury/domain/treasury-rules';
import { Purchase, PurchaseLine } from '../domain/purchase.entity';
import {
  DuplicatePurchaseInvoiceException,
  LotConflictException,
} from '../domain/purchase.exceptions';

const toDateOnly = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
import { PurchaseQueryFilters } from '@farmacia/contracts';

@Injectable()
export class PrismaPurchaseRepository implements IPurchaseRepository {
  private readonly client: PrismaClient;
  /** Solo se usa su reintento ante conflictos de serialización (40001/40P01). */
  private readonly retry = new IdempotencyService();

  constructor(
    @Optional() customClient?: PrismaClient,
    @Optional() private readonly payablesLedger: PayablesLedger = new PayablesLedger(),
    @Optional() private readonly inventoryLedger: InventoryLedger = new InventoryLedger(),
  ) {
    this.client = customClient ?? prisma;
  }

  async saveTransactional(
    purchase: Purchase,
    defaultLocationId: string,
    actorUserId: string | null,
    afterSaveTx?: (tx: any, savedPurchase: Purchase) => Promise<void>,
  ): Promise<Purchase> {
    try {
      // Dos recepciones simultáneas del mismo lote chocan en SERIALIZABLE (40001): se repite la
      // transacción completa en lugar de rechazar una compra válida
      return await this.retry.retryOnSerialization(() =>
        this.saveInTransaction(purchase, defaultLocationId, actorUserId, afterSaveTx),
      );
    } catch (error) {
      // UNIQUE (supplier_id, invoice_number): también cubre dos recepciones simultáneas
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        isPurchaseInvoiceUniqueError(error)
      ) {
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
    return await this.client.$transaction(
      async (tx) => {
        // 1. Crear registro de la Compra
        await tx.purchase.create({
          data: {
            id: purchase.id,
            supplierId: purchase.supplierId,
            invoiceNumber: purchase.invoiceNumber,
            purchaseDate: purchase.purchaseDate,
            totalAmount: new Prisma.Decimal(purchase.totalAmount),
            ...(purchase.taxTotals
              ? {
                  subtotal: new Prisma.Decimal(purchase.taxTotals.subtotal),
                  vatTotal: new Prisma.Decimal(purchase.taxTotals.vatTotal),
                  withholdingIncome: new Prisma.Decimal(purchase.taxTotals.withholdingIncome),
                  withholdingVat: new Prisma.Decimal(purchase.taxTotals.withholdingVat),
                  withholdingIca: new Prisma.Decimal(purchase.taxTotals.withholdingIca),
                  taxSnapshot: (purchase.taxTotals.withholdings ?? []) as Prisma.InputJsonValue,
                }
              : {}),
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
        await this.payablesLedger.openForPurchase(tx, {
          purchaseId: purchase.id,
          supplierId: purchase.supplierId,
          // F6: al proveedor se le debe el neto; las retenciones se le deben a la DIAN y al municipio
          totalAmount: purchase.payableAmount,
          dueDate: payableDueDate,
          notes: purchase.notes,
        });

        // 2. Procesar cada línea de compra y afectar inventario
        for (const line of purchase.lines) {
          const locationId = line.locationId ?? defaultLocationId;
          const controlMode = line.controlMode;
          if (!controlMode) throw new Error('PurchaseLine sin controlMode del producto validado.');
          let lotId: string;
          let existing: Awaited<ReturnType<InventoryLedger['lockLotByNumber']>> = null;

          if (controlMode === 'SIMPLE') {
            existing = await this.inventoryLedger.lockOrCreateSimpleBalance(tx, {
              productId: line.productId,
              locationId,
            });
            lotId = existing.id;
          } else if (controlMode === 'SERIAL') {
            const serialRows = await this.inventoryLedger.lockSerials(tx, {
              productId: line.productId,
              serialNumbers: [line.lotNumber!],
            });
            if (serialRows.length > 0) {
              throw new LotConflictException(
                `La serie "${line.lotNumber}" ya existe para este producto.`,
              );
            }
            lotId = await this.inventoryLedger.createLot(tx, {
              id: line.lotId,
              productId: line.productId,
              locationId,
              lotNumber: line.lotNumber,
              expirationDate: null,
              controlMode,
              currentQuantity: line.quantityBaseUnits,
            });
          } else {
            existing = await this.inventoryLedger.lockLotByNumber(tx, {
              productId: line.productId,
              locationId,
              lotNumber: line.lotNumber!,
            });
            if (existing) {
              // Un lote es un único vencimiento: la recepción no lo reescribe ni lo reactiva
              if (toDateOnly(existing.expiration_date) !== toDateOnly(line.expirationDate)) {
                throw new LotConflictException(
                  `El lote "${line.lotNumber}" ya existe con vencimiento ${toDateOnly(existing.expiration_date) ?? 'No vence'}; la factura indica ${toDateOnly(line.expirationDate) ?? 'No vence'}.`,
                );
              }
              if (!existing.is_active) {
                throw new LotConflictException(
                  `El lote "${line.lotNumber}" está inactivo; no se puede recibir mercancía en él.`,
                );
              }
              lotId = existing.id;
            } else {
              lotId = await this.inventoryLedger.createLot(tx, {
                id: line.lotId,
                productId: line.productId,
                locationId,
                lotNumber: line.lotNumber,
                expirationDate: line.expirationDate,
                controlMode,
                currentQuantity: line.quantityBaseUnits,
              });
            }
          }
          line.setLotId(lotId);

          const factorHistorical = line.conversionFactor;

          // Insertar línea de compra
          await tx.purchaseLine.create({
            data: {
              id: line.id,
              purchaseId: purchase.id,
              productId: line.productId,
              presentationId: line.presentationId,
              lotId,
              quantityCommercial: new Prisma.Decimal(line.quantityCommercial),
              presentationFactorHistorical: factorHistorical,
              quantityBaseUnits: line.quantityBaseUnits,
              unitCost: new Prisma.Decimal(line.unitCost),
              subtotal: new Prisma.Decimal(line.subtotal),
              vatRate: new Prisma.Decimal(line.vatRate),
              vatAmount: new Prisma.Decimal(line.vatAmount),
              ...(line.taxSnapshot
                ? { taxSnapshot: line.taxSnapshot as Prisma.InputJsonValue }
                : {}),
              lotNumber: line.lotNumber,
              expirationDate: line.expirationDate,
              createdAt: line.createdAt,
            },
          });

          // Entrada al lote (si ya existía) y movimiento inmutable de Kardex
          const entry = {
            movementType: 'ENTRADA_COMPRA',
            productId: line.productId,
            presentationId: line.presentationId,
            quantityBaseUnits: line.quantityBaseUnits,
            presentationFactorHistorical: factorHistorical,
            quantityCommercial: new Prisma.Decimal(line.quantityCommercial),
            referenceDocumentType: 'COMPRA',
            referenceDocumentId: purchase.id,
            notes: `Recepción factura ${purchase.invoiceNumber} - ${line.lotNumber ? `Lote ${line.lotNumber}` : 'Saldo SIMPLE'}`,
            createdByUserId: actorUserId,
          };
          if (existing) {
            await this.inventoryLedger.changeLotQuantity(tx, lotId, line.quantityBaseUnits, entry);
          } else {
            await this.inventoryLedger.recordMovement(tx, lotId, line.quantityBaseUnits, entry);
          }

          // Submayor de costos (ADR-005): entra al costo de la factura, sin IVA
          await this.inventoryLedger.valuation.receive(tx, {
            productId: line.productId,
            quantityBaseUnits: line.quantityBaseUnits,
            // F6: si la empresa no es responsable de IVA, el IVA pagado es mayor costo
            valueCents: parseMoneyToCents(
              new Prisma.Decimal(line.subtotal)
                .plus(purchase.taxTotals?.vatDeductible === false ? line.vatAmount : 0)
                .toFixed(2),
              'Costo de la línea',
            ),
            movementType: 'PURCHASE',
            sourceType: 'PURCHASE',
            sourceId: purchase.id,
            userId: actorUserId,
            lots: [{ lotId, quantityBaseUnits: line.quantityBaseUnits }],
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
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
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
    prismaClient: PrismaClient | Prisma.TransactionClient,
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
        vatRate: Number(l.vatRate ?? 0),
        vatAmount: Number(l.vatAmount ?? 0),
        taxSnapshot: l.taxSnapshot ?? null,
        createdAt: l.createdAt,
      }),
    );

    const dueDate = raw.payable?.dueDate ?? null;
    let paymentCondition: string | null = null;
    if (raw.notes && raw.notes.includes('Condición: Contado')) {
      paymentCondition = 'CONTADO';
    } else if (raw.notes && raw.notes.includes('Condición: Crédito')) {
      paymentCondition = 'CREDITO';
    } else if (
      dueDate &&
      raw.purchaseDate &&
      new Date(dueDate).getTime() <= new Date(raw.purchaseDate).getTime()
    ) {
      paymentCondition = 'CONTADO';
    } else if (
      dueDate &&
      raw.purchaseDate &&
      new Date(dueDate).getTime() > new Date(raw.purchaseDate).getTime()
    ) {
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
      taxTotals:
        raw.subtotal === null || raw.subtotal === undefined
          ? null
          : {
              subtotal: Number(raw.subtotal),
              vatTotal: Number(raw.vatTotal),
              withholdingIncome: Number(raw.withholdingIncome),
              withholdingVat: Number(raw.withholdingVat),
              withholdingIca: Number(raw.withholdingIca),
            },
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

function isPurchaseInvoiceUniqueError(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = error.meta?.target;
  const rendered = `${String(target ?? '')} ${error.message}`.toLowerCase();
  return rendered.includes('invoice_number') || rendered.includes('supplier_id_invoice_number');
}
