import { Injectable, Logger } from '@nestjs/common';
import { prisma as defaultPrisma, PrismaClient } from '@farmacia/database';
import {
  CashMovementReportItemDto,
  CashSummaryReportDto,
  ExpirationReportItemDto,
  ExpirationsReportDto,
  ExpirationSeverity,
  InventoryValuationItemDto,
  InventoryValuationReportDto,
  ReportDateFilter,
  SalesReportDto,
  SalesReportItemDto,
} from '@farmacia/contracts';
import { calculateExpirationSeverity } from '../../alerts/domain/alert.entity';
import { generateCsv } from '../utils/csv-exporter.util';

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

    let totalUnits = 0;
    let totalCostValuation = 0;
    let totalPriceValuation = 0;

    const items: InventoryValuationItemDto[] = products.map((prod: any) => {
      const currentStock = prod.lots.reduce(
        (sum: number, lot: any) => sum + lot.currentQuantity,
        0,
      );
      const baseCost = Number(prod.baseCost);
      const basePrice = Number(prod.basePrice);
      const totalCostValue = Math.round(currentStock * baseCost * 100) / 100;
      const totalPriceValue = Math.round(currentStock * basePrice * 100) / 100;

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
        baseCost,
        basePrice,
        totalCostValue,
        totalPriceValue,
        activeLotsCount: prod.lots.length,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      totalProducts: items.length,
      totalUnits,
      totalCostValuation: Math.round(totalCostValuation * 100) / 100,
      totalPriceValuation: Math.round(totalPriceValuation * 100) / 100,
      items,
    };
  }

  exportInventoryValuationCsv(data: InventoryValuationReportDto): string {
    return generateCsv(
      [
        { header: 'Código', accessor: (i: InventoryValuationItemDto) => i.productCode },
        { header: 'Medicamento / Producto', accessor: (i: InventoryValuationItemDto) => i.productName },
        { header: 'Categoría', accessor: (i: InventoryValuationItemDto) => i.categoryName },
        { header: 'Unidad Base', accessor: (i: InventoryValuationItemDto) => i.baseUnit },
        { header: 'Stock Actual', accessor: (i: InventoryValuationItemDto) => i.currentStock },
        { header: 'Costo Unitario ($)', accessor: (i: InventoryValuationItemDto) => i.baseCost.toFixed(2) },
        { header: 'Precio Unitario ($)', accessor: (i: InventoryValuationItemDto) => i.basePrice.toFixed(2) },
        { header: 'Valorización al Costo ($)', accessor: (i: InventoryValuationItemDto) => i.totalCostValue.toFixed(2) },
        { header: 'Valorización al Precio ($)', accessor: (i: InventoryValuationItemDto) => i.totalPriceValue.toFixed(2) },
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
        where.createdAt.gte = new Date(filter.fromDate);
      }
      if (filter.toDate) {
        const toDateEnd = new Date(filter.toDate);
        toDateEnd.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = toDateEnd;
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

    let totalAmount = 0;
    const byPaymentMethod: Record<string, number> = {};

    const items: SalesReportItemDto[] = sales.map((sale: any) => {
      const amount = Number(sale.total);
      totalAmount += amount;

      const method = sale.paymentMethod || 'EFECTIVO';
      byPaymentMethod[method] = (byPaymentMethod[method] || 0) + amount;

      return {
        saleId: sale.id,
        invoiceNumber: sale.invoiceNumber,
        soldAt: sale.createdAt.toISOString(),
        customerName: sale.customer?.name || 'Cliente Ocasional',
        customerDocument: sale.customer ? `${sale.customer.documentType} ${sale.customer.documentNumber}` : 'Consumidor Final',
        paymentMethod: method,
        status: sale.status,
        itemsCount: sale.lines.length,
        subtotal: Number(sale.subtotal),
        taxAmount: Number(sale.taxTotal),
        totalAmount: amount,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      fromDate: filter.fromDate || null,
      toDate: filter.toDate || null,
      totalSales: items.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      byPaymentMethod,
      items,
    };
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
        { header: 'IVA / Impuesto ($)', accessor: (i: SalesReportItemDto) => i.taxAmount.toFixed(2) },
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
        where.createdAt.gte = new Date(filter.fromDate);
      }
      if (filter.toDate) {
        const toDateEnd = new Date(filter.toDate);
        toDateEnd.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = toDateEnd;
      }
    }

    const movements = await this.prisma.cashMovement.findMany({
      where,
      include: {
        createdByUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalInflows = 0;
    let totalOutflows = 0;

    const items: CashMovementReportItemDto[] = movements.map((m: any) => {
      const amount = Number(m.amount);
      const isIngreso = m.movementType === 'INGRESO' || m.movementType === 'VENTA' || m.movementType === 'APERTURA';

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
        amount,
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
      totalInflows: Math.round(totalInflows * 100) / 100,
      totalOutflows: Math.round(totalOutflows * 100) / 100,
      netCashFlow: Math.round((totalInflows - totalOutflows) * 100) / 100,
      items,
    };
  }

  exportCashSummaryCsv(data: CashSummaryReportDto): string {
    return generateCsv(
      [
        { header: 'Fecha y Hora', accessor: (i: CashMovementReportItemDto) => i.createdAt },
        { header: 'Tipo Flujo', accessor: (i: CashMovementReportItemDto) => (i.movementType === 'IN' ? 'INGRESO' : 'EGRESO') },
        { header: 'Concepto / Descripción', accessor: (i: CashMovementReportItemDto) => i.concept },
        { header: 'Monto ($)', accessor: (i: CashMovementReportItemDto) => i.amount.toFixed(2) },
        { header: 'Medio de Pago', accessor: (i: CashMovementReportItemDto) => i.paymentMethod },
        { header: 'Doc. Referencia', accessor: (i: CashMovementReportItemDto) => i.referenceDocumentType ? `${i.referenceDocumentType} ${i.referenceDocumentId || ''}` : 'N/A' },
        { header: 'Usuario', accessor: (i: CashMovementReportItemDto) => i.userName || 'Sistema' },
      ],
      data.items,
    );
  }
}
