import {
  businessDayStart,
  businessDayEnd,
  businessToday,
} from '../../../common/utils/business-date';
import { Injectable, Logger } from '@nestjs/common';
import { prisma as defaultPrisma, PrismaClient } from '@farmacia/database';
import {
  SupplierReturnItemDto,
  SupplierReturnReportDto,
  CashMovementReportItemDto,
  CashSummaryReportDto,
  ExpirationReportItemDto,
  ExpirationsReportDto,
  ExpirationSeverity,
  InventoryValuationIssue,
  TopProductsFilter,
  TopProductItemDto,
  TopProductsReportDto,
  InventoryValuationItemDto,
  InventoryValuationReportDto,
  ReportDateFilter,
  SalesReportDto,
  SalesReportItemDto,
} from '@farmacia/contracts';
import { calculateExpirationSeverity } from '../../alerts/domain/alert.entity';
import { centsToNumber, moneyToCents } from '../domain/report-money';
import { queryTopProducts } from '../infrastructure/top-products.query';
import { generateCsv } from '../utils/csv-exporter.util';
import {
  SUPPLIER_NOTICE_FROM_DAYS,
  SUPPLIER_NOTICE_UNTIL_DAYS,
  SUPPLIER_RETURN_LIMIT_DAYS,
  supplierReturnStatus,
} from '../domain/supplier-return-window';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly prisma: PrismaClient;

  constructor() {
    this.prisma = defaultPrisma;
  }

  // ==========================================================================
  // 1. REPORTE DE INVENTARIO VALORIZADO
  // ==========================================================================

  async getInventoryValuationReport(): Promise<InventoryValuationReportDto> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: {
        category: true,
        lots: {
          where: {
            isActive: true,
            currentQuantity: { gt: 0 },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    // Submayor de costos (ADR-005): promedio ponderado real de los productos ya valorizados
    const balances = new Map(
      (
        await this.prisma.inventoryCostBalance.findMany({
          where: { productId: { in: products.map((p) => p.id) } },
        })
      ).map((b) => [b.productId, b]),
    );

    let totalUnits = 0;
    let totalCostValuation = 0n;
    let totalPriceValuation = 0n;
    let totalPotentialMargin = 0n;
    let productsWithValuationIssues = 0;

    const items: InventoryValuationItemDto[] = products.map((prod) => {
      const currentStock = prod.lots.reduce((sum, lot) => sum + lot.currentQuantity, 0);
      const balance = balances.get(prod.id);
      const valued = balance !== undefined && balance.quantityBaseUnits > 0;
      const valuedCents = valued ? moneyToCents(balance!.totalValue) : 0n;
      const valuedQuantity = BigInt(valued ? balance!.quantityBaseUnits : 1);
      // Los lotes inactivos quedan fuera de la existencia reportada: se prorratea el saldo
      const baseCost = valued
        ? (valuedCents * 2n + valuedQuantity) / (valuedQuantity * 2n)
        : moneyToCents(prod.baseCost);
      const basePrice = moneyToCents(prod.basePrice);
      const totalCostValue = !valued
        ? BigInt(currentStock) * baseCost
        : BigInt(currentStock) === valuedQuantity
          ? valuedCents
          : (valuedCents * BigInt(currentStock) * 2n + valuedQuantity) / (valuedQuantity * 2n);
      const totalPriceValue = BigInt(currentStock) * basePrice;
      const valuationIssue: InventoryValuationIssue | null =
        baseCost <= 0n
          ? basePrice <= 0n
            ? 'MISSING_COST_AND_PRICE'
            : 'MISSING_COST'
          : basePrice <= 0n
            ? 'MISSING_PRICE'
            : null;
      const potentialMargin = valuationIssue ? null : totalPriceValue - totalCostValue;
      if (potentialMargin !== null) totalPotentialMargin += potentialMargin;
      if (currentStock > 0 && valuationIssue) productsWithValuationIssues++;

      totalUnits += currentStock;
      totalCostValuation += totalCostValue;
      totalPriceValuation += totalPriceValue;

      return {
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        categoryName: prod.category?.name || 'Sin Categoría',
        baseUnit: prod.baseUnit,
        currentStock,
        baseCost: centsToNumber(baseCost),
        costSource: valued ? 'VALUATION' : 'CATALOG',
        basePrice: centsToNumber(basePrice),
        totalCostValue: centsToNumber(totalCostValue),
        totalPriceValue: centsToNumber(totalPriceValue),
        potentialMargin: potentialMargin === null ? null : centsToNumber(potentialMargin),
        valuationIssue,
        activeLotsCount: prod.lots.length,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      totalProducts: items.length,
      totalUnits,
      totalPotentialMargin: centsToNumber(totalPotentialMargin),
      productsWithValuationIssues,
      totalCostValuation: centsToNumber(totalCostValuation),
      totalPriceValuation: centsToNumber(totalPriceValuation),
      items,
    };
  }

  exportInventoryValuationCsv(data: InventoryValuationReportDto): string {
    return generateCsv(
      [
        { header: 'Código', accessor: (i: InventoryValuationItemDto) => i.productCode },
        {
          header: 'Medicamento / Producto',
          accessor: (i: InventoryValuationItemDto) => i.productName,
        },
        { header: 'Categoría', accessor: (i: InventoryValuationItemDto) => i.categoryName },
        { header: 'Unidad Base', accessor: (i: InventoryValuationItemDto) => i.baseUnit },
        { header: 'Stock Actual', accessor: (i: InventoryValuationItemDto) => i.currentStock },
        {
          header: 'Costo Unitario ($)',
          accessor: (i: InventoryValuationItemDto) => i.baseCost.toFixed(2),
        },
        {
          header: 'Precio Unitario ($)',
          accessor: (i: InventoryValuationItemDto) => i.basePrice.toFixed(2),
        },
        {
          header: 'Valorización al Costo ($)',
          accessor: (i: InventoryValuationItemDto) => i.totalCostValue.toFixed(2),
        },
        {
          header: 'Valorización al Precio ($)',
          accessor: (i: InventoryValuationItemDto) => i.totalPriceValue.toFixed(2),
        },
        {
          header: 'Margen Potencial ($)',
          accessor: (i: InventoryValuationItemDto) => i.potentialMargin?.toFixed(2) ?? '',
        },
        {
          header: 'Observación',
          accessor: (i: InventoryValuationItemDto) =>
            i.valuationIssue
              ? {
                  MISSING_COST: 'Sin costo',
                  MISSING_PRICE: 'Sin precio',
                  MISSING_COST_AND_PRICE: 'Sin costo ni precio',
                }[i.valuationIssue]
              : '',
        },
        { header: 'Lotes Activos', accessor: (i: InventoryValuationItemDto) => i.activeLotsCount },
      ],
      data.items,
    );
  }

  // ==========================================================================
  // 2. REPORTE DE LOTES Y PRÓXIMOS VENCIMIENTOS
  // ==========================================================================

  async getExpirationsReport(referenceDate: Date = new Date()): Promise<ExpirationsReportDto> {
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        isActive: true,
        currentQuantity: { gt: 0 },
        expirationDate: { not: null },
      },
      include: {
        product: {
          include: { category: true },
        },
        location: true,
      },
      orderBy: { expirationDate: 'asc' },
    });

    let vencidosCount = 0;
    let criticosCount = 0;
    let alertasCount = 0;
    let proximosCount = 0;

    const items: ExpirationReportItemDto[] = [];

    for (const lot of lots) {
      if (lot.expirationDate === null) continue;
      const { daysRemaining, severity } = calculateExpirationSeverity(
        lot.expirationDate,
        referenceDate,
      );

      // Solo incluimos lotes con alerta (<= 90 días o vencidos)
      if (severity !== 'NORMAL') {
        if (severity === 'VENCIDO') vencidosCount++;
        else if (severity === 'CRITICO') criticosCount++;
        else if (severity === 'ALERTA') alertasCount++;
        else if (severity === 'PROXIMO') proximosCount++;

        items.push({
          lotId: lot.id,
          lotNumber: lot.lotNumber,
          productId: lot.productId,
          productCode: lot.product.code,
          productName: lot.product.name,
          categoryName: lot.product.category?.name || 'Sin Categoría',
          expirationDate: lot.expirationDate.toISOString().split('T')[0],
          daysRemaining,
          severity,
          currentQuantity: lot.currentQuantity,
          baseUnit: lot.product.baseUnit,
          locationName: lot.location.name,
        });
      }
    }

    return {
      generatedAt: referenceDate.toISOString(),
      totalLots: items.length,
      vencidosCount,
      criticosCount,
      alertasCount,
      proximosCount,
      items,
    };
  }

  /**
   * Lotes con existencias que vencen en 120 días o menos, con el proveedor de su última
   * compra, para avisarle entre 120 y 110 días antes y devolver antes de los 90 días.
   */
  async getSupplierReturnsReport(
    referenceDay: string = businessToday(),
  ): Promise<SupplierReturnReportDto> {
    const reference = new Date(`${referenceDay}T00:00:00.000Z`);
    const horizon = new Date(reference.getTime() + SUPPLIER_NOTICE_FROM_DAYS * 86_400_000);
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        isActive: true,
        currentQuantity: { gt: 0 },
        expirationDate: { not: null, gt: reference, lte: horizon },
      },
      include: { product: true },
      orderBy: { expirationDate: 'asc' },
    });

    const purchaseLines = await this.prisma.purchaseLine.findMany({
      where: { lotId: { in: lots.map((l: { id: string }) => l.id) } },
      include: { purchase: { include: { supplier: true } } },
      orderBy: { purchase: { purchaseDate: 'desc' } },
    });
    const lastPurchaseByLot = new Map<string, (typeof purchaseLines)[number]>();
    for (const line of purchaseLines) {
      if (line.lotId && !lastPurchaseByLot.has(line.lotId)) lastPurchaseByLot.set(line.lotId, line);
    }

    const items: SupplierReturnItemDto[] = [];
    for (const lot of lots) {
      if (lot.expirationDate === null) continue;
      const { daysRemaining } = calculateExpirationSeverity(
        lot.expirationDate,
        businessDayStart(referenceDay),
      );
      const status = supplierReturnStatus(daysRemaining);
      if (!status) continue;
      const purchase = lastPurchaseByLot.get(lot.id)?.purchase;
      items.push({
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        productCode: lot.product.code,
        productName: lot.product.name,
        expirationDate: lot.expirationDate.toISOString().slice(0, 10),
        daysRemaining,
        currentQuantity: lot.currentQuantity,
        baseUnit: lot.product.baseUnit,
        supplierId: purchase?.supplier?.id ?? null,
        supplierName: purchase?.supplier?.name ?? null,
        supplierPhone: purchase?.supplier?.phone ?? null,
        lastPurchaseInvoice: purchase?.invoiceNumber ?? null,
        status,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      referenceDate: referenceDay,
      noticeWindowDays: { from: SUPPLIER_NOTICE_FROM_DAYS, until: SUPPLIER_NOTICE_UNTIL_DAYS },
      returnLimitDays: SUPPLIER_RETURN_LIMIT_DAYS,
      notifyNowCount: items.filter((i) => i.status === 'AVISAR_AHORA').length,
      lateNoticeCount: items.filter((i) => i.status === 'AVISO_ATRASADO').length,
      outOfWindowCount: items.filter((i) => i.status === 'FUERA_DE_PLAZO').length,
      items,
    };
  }

  exportSupplierReturnsCsv(data: SupplierReturnReportDto): string {
    const statusLabels: Record<SupplierReturnItemDto['status'], string> = {
      AVISAR_AHORA: 'Avisar al proveedor',
      AVISO_ATRASADO: 'Aviso atrasado',
      FUERA_DE_PLAZO: 'Fuera del plazo de devolución',
    };
    return generateCsv(
      [
        { header: 'Estado', accessor: (i: SupplierReturnItemDto) => statusLabels[i.status] },
        {
          header: 'Proveedor',
          accessor: (i: SupplierReturnItemDto) => i.supplierName ?? 'Sin compra registrada',
        },
        { header: 'Teléfono', accessor: (i: SupplierReturnItemDto) => i.supplierPhone ?? '' },
        {
          header: 'Factura de compra',
          accessor: (i: SupplierReturnItemDto) => i.lastPurchaseInvoice ?? '',
        },
        { header: 'Código', accessor: (i: SupplierReturnItemDto) => i.productCode },
        { header: 'Producto', accessor: (i: SupplierReturnItemDto) => i.productName },
        { header: 'Lote', accessor: (i: SupplierReturnItemDto) => i.lotNumber },
        { header: 'Vence', accessor: (i: SupplierReturnItemDto) => i.expirationDate },
        { header: 'Días restantes', accessor: (i: SupplierReturnItemDto) => i.daysRemaining },
        { header: 'Existencia', accessor: (i: SupplierReturnItemDto) => i.currentQuantity },
        { header: 'Unidad', accessor: (i: SupplierReturnItemDto) => i.baseUnit },
      ],
      data.items,
    );
  }

  exportExpirationsCsv(data: ExpirationsReportDto): string {
    return generateCsv(
      [
        { header: 'Lote', accessor: (i: ExpirationReportItemDto) => i.lotNumber },
        { header: 'Código', accessor: (i: ExpirationReportItemDto) => i.productCode },
        { header: 'Medicamento', accessor: (i: ExpirationReportItemDto) => i.productName },
        { header: 'Categoría', accessor: (i: ExpirationReportItemDto) => i.categoryName },
        { header: 'Fecha Vencimiento', accessor: (i: ExpirationReportItemDto) => i.expirationDate },
        { header: 'Días Restantes', accessor: (i: ExpirationReportItemDto) => i.daysRemaining },
        { header: 'Severidad', accessor: (i: ExpirationReportItemDto) => i.severity },
        { header: 'Stock Actual', accessor: (i: ExpirationReportItemDto) => i.currentQuantity },
        { header: 'Unidad', accessor: (i: ExpirationReportItemDto) => i.baseUnit },
        { header: 'Ubicación', accessor: (i: ExpirationReportItemDto) => i.locationName },
      ],
      data.items,
    );
  }

  // ==========================================================================
  // 3. REPORTE DE VENTAS POR PERÍODO
  // ==========================================================================

  async getSalesReport(filter: ReportDateFilter = {}): Promise<SalesReportDto> {
    const where: any = {
      status: { not: 'CANCELLED' },
    };

    if (filter.fromDate || filter.toDate) {
      where.createdAt = {};
      if (filter.fromDate) {
        where.createdAt.gte = businessDayStart(filter.fromDate);
      }
      if (filter.toDate) {
        where.createdAt.lte = businessDayEnd(filter.toDate);
      }
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        customer: true,
        lines: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalAmount = 0n;
    const byPaymentMethod: Record<string, bigint> = {};

    const items: SalesReportItemDto[] = sales.map((sale) => {
      const amount = moneyToCents(sale.total);
      totalAmount += amount;

      const method = sale.paymentMethod || 'EFECTIVO';
      byPaymentMethod[method] = (byPaymentMethod[method] ?? 0n) + amount;

      return {
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        soldAt: sale.createdAt.toISOString(),
        customerName: sale.customer?.name || 'Cliente Ocasional',
        customerDocument: sale.customer
          ? `${sale.customer.documentType} ${sale.customer.documentNumber}`
          : 'Consumidor Final',
        paymentMethod: method,
        status: sale.status,
        itemsCount: sale.lines.length,
        subtotal: centsToNumber(moneyToCents(sale.subtotal)),
        taxAmount: centsToNumber(moneyToCents(sale.taxTotal)),
        totalAmount: centsToNumber(amount),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      fromDate: filter.fromDate || null,
      toDate: filter.toDate || null,
      totalSales: items.length,
      totalAmount: centsToNumber(totalAmount),
      byPaymentMethod: Object.fromEntries(
        Object.entries(byPaymentMethod).map(([method, cents]) => [method, centsToNumber(cents)]),
      ),
      items,
    };
  }

  async getTopProductsReport(filter: TopProductsFilter = {}): Promise<TopProductsReportDto> {
    const sortBy = filter.sortBy ?? 'units';
    const limit = filter.limit ?? 20;
    const rows = await queryTopProducts(
      this.prisma,
      filter.fromDate ? businessDayStart(filter.fromDate) : undefined,
      filter.toDate ? businessDayEnd(filter.toDate) : undefined,
      sortBy,
      limit,
    );
    return {
      generatedAt: new Date().toISOString(),
      fromDate: filter.fromDate ?? null,
      toDate: filter.toDate ?? null,
      sortBy,
      limit,
      items: rows.map((row, index) => ({
        ...row,
        rank: index + 1,
        soldBaseUnits: Number(row.soldBaseUnits),
        returnedBaseUnits: Number(row.returnedBaseUnits),
        netBaseUnits: Number(row.netBaseUnits),
        salesCount: Number(row.salesCount),
        soldValue: centsToNumber(moneyToCents(row.soldValue)),
        returnedValue: centsToNumber(moneyToCents(row.returnedValue)),
        netValue: centsToNumber(moneyToCents(row.netValue)),
      })),
    };
  }

  exportTopProductsCsv(data: TopProductsReportDto): string {
    return generateCsv<TopProductItemDto>(
      [
        { header: 'Posición', accessor: (i) => i.rank },
        { header: 'Código', accessor: (i) => i.productCode },
        { header: 'Producto', accessor: (i) => i.productName },
        { header: 'Unidad Base', accessor: (i) => i.baseUnit },
        { header: 'Unidades Vendidas', accessor: (i) => i.soldBaseUnits },
        { header: 'Unidades Devueltas', accessor: (i) => i.returnedBaseUnits },
        { header: 'Unidades Netas', accessor: (i) => i.netBaseUnits },
        { header: 'Valor Vendido ($)', accessor: (i) => i.soldValue.toFixed(2) },
        { header: 'Valor Devuelto ($)', accessor: (i) => i.returnedValue.toFixed(2) },
        { header: 'Valor Neto ($)', accessor: (i) => i.netValue.toFixed(2) },
        { header: 'Ventas', accessor: (i) => i.salesCount },
      ],
      data.items,
    );
  }

  exportSalesCsv(data: SalesReportDto): string {
    return generateCsv(
      [
        { header: 'Comprobante', accessor: (i: SalesReportItemDto) => i.invoiceNumber },
        { header: 'Fecha y Hora', accessor: (i: SalesReportItemDto) => i.soldAt },
        { header: 'Cliente', accessor: (i: SalesReportItemDto) => i.customerName },
        { header: 'Documento', accessor: (i: SalesReportItemDto) => i.customerDocument },
        { header: 'Medio de Pago', accessor: (i: SalesReportItemDto) => i.paymentMethod },
        { header: 'Líneas', accessor: (i: SalesReportItemDto) => i.itemsCount },
        { header: 'Subtotal ($)', accessor: (i: SalesReportItemDto) => i.subtotal.toFixed(2) },
        {
          header: 'IVA / Impuesto ($)',
          accessor: (i: SalesReportItemDto) => i.taxAmount.toFixed(2),
        },
        { header: 'Total ($)', accessor: (i: SalesReportItemDto) => i.totalAmount.toFixed(2) },
        { header: 'Estado', accessor: (i: SalesReportItemDto) => i.status },
      ],
      data.items,
    );
  }

  // ==========================================================================
  // 4. REPORTE DE RESUMEN DE CAJA Y MOVIMIENTOS
  // ==========================================================================

  async getCashSummaryReport(filter: ReportDateFilter = {}): Promise<CashSummaryReportDto> {
    const where: any = {};

    if (filter.fromDate || filter.toDate) {
      where.createdAt = {};
      if (filter.fromDate) {
        where.createdAt.gte = businessDayStart(filter.fromDate);
      }
      if (filter.toDate) {
        where.createdAt.lte = businessDayEnd(filter.toDate);
      }
    }

    const movements = await this.prisma.cashMovement.findMany({
      where,
      include: {
        createdByUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalInflows = 0n;
    let totalOutflows = 0n;

    const items: CashMovementReportItemDto[] = movements.map((m) => {
      const amount = moneyToCents(m.amount);
      // Tipos reales: INGRESO_VENTA, INGRESO_MANUAL, EGRESO_MANUAL, EGRESO_PAGO_PROVEEDOR.
      // Antes solo se reconocían 'INGRESO', 'VENTA' y 'APERTURA', así que toda venta en
      // efectivo salía como egreso. Se aceptan también esos nombres por datos antiguos.
      const isIngreso =
        String(m.movementType).startsWith('INGRESO') ||
        m.movementType === 'VENTA' ||
        m.movementType === 'APERTURA';

      if (isIngreso) {
        totalInflows += amount;
      } else {
        totalOutflows += amount;
      }

      return {
        id: m.id,
        createdAt: m.createdAt.toISOString(),
        movementType: isIngreso ? 'IN' : 'OUT',
        concept: m.reason || m.movementType,
        amount: centsToNumber(amount),
        debit: isIngreso ? centsToNumber(amount) : 0,
        credit: isIngreso ? 0 : centsToNumber(-amount),
        balanceAfter: centsToNumber(moneyToCents(m.balanceAfter)),
        paymentMethod: m.paymentMethod,
        referenceDocumentType: m.referenceDocumentType,
        referenceDocumentId: m.referenceDocumentId,
        userName: m.createdByUser?.username || null,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      fromDate: filter.fromDate || null,
      toDate: filter.toDate || null,
      totalMovements: items.length,
      totalInflows: centsToNumber(totalInflows),
      totalOutflows: centsToNumber(totalOutflows),
      netCashFlow: centsToNumber(totalInflows - totalOutflows),
      items,
    };
  }

  exportCashSummaryCsv(data: CashSummaryReportDto): string {
    return generateCsv(
      [
        { header: 'Fecha y Hora', accessor: (i: CashMovementReportItemDto) => i.createdAt },
        {
          header: 'Tipo Flujo',
          accessor: (i: CashMovementReportItemDto) =>
            i.movementType === 'IN' ? 'INGRESO' : 'EGRESO',
        },
        { header: 'Concepto / Descripción', accessor: (i: CashMovementReportItemDto) => i.concept },
        // Acuerdo del 4 de octubre: débitos positivos, créditos negativos y saldo
        { header: 'Débito ($)', accessor: (i: CashMovementReportItemDto) => i.debit.toFixed(2) },
        { header: 'Crédito ($)', accessor: (i: CashMovementReportItemDto) => i.credit.toFixed(2) },
        {
          header: 'Saldo ($)',
          accessor: (i: CashMovementReportItemDto) => i.balanceAfter.toFixed(2),
        },
        { header: 'Medio de Pago', accessor: (i: CashMovementReportItemDto) => i.paymentMethod },
        {
          header: 'Doc. Referencia',
          accessor: (i: CashMovementReportItemDto) =>
            i.referenceDocumentType
              ? `${i.referenceDocumentType} ${i.referenceDocumentId || ''}`
              : 'N/A',
        },
        { header: 'Usuario', accessor: (i: CashMovementReportItemDto) => i.userName || 'Sistema' },
      ],
      data.items,
    );
  }
}
