import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from '../application/reports.service';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

@Controller('reports')
@UseGuards(SessionAuthGuard, PermissionsGuard)
@RequirePermissions(SYSTEM_PERMISSIONS.REPORTS_READ)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /api/v1/reports/inventory-valuation
   * Reporte de existencias e inventario valorizado (al costo y precio de venta).
   */
  @Get('inventory-valuation')
  async getInventoryValuation(
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getInventoryValuationReport();

    if (format === 'csv') {
      const csv = this.reportsService.exportInventoryValuationCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reporte_inventario_valorizado_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      return res.send(csv);
    }

    return res.json({ success: true, data });
  }

  /**
   * GET /api/v1/reports/expirations
   * Reporte de lotes y próximos vencimientos.
   */
  @Get('expirations')
  async getExpirations(
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getExpirationsReport();

    if (format === 'csv') {
      const csv = this.reportsService.exportExpirationsCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reporte_vencimientos_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      return res.send(csv);
    }

    return res.json({ success: true, data });
  }

  /**
   * GET /api/v1/reports/supplier-returns
   * Lotes por vencer para avisar al proveedor (120 a 110 días) y devolver antes de 90 días.
   */
  @Get('supplier-returns')
  async getSupplierReturns(
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getSupplierReturnsReport();

    if (format === 'csv') {
      const csv = this.reportsService.exportSupplierReturnsCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="devoluciones_proveedor_${data.referenceDate}.csv"`,
      );
      return res.send(csv);
    }

    return res.json({ success: true, data });
  }

  /**
   * GET /api/v1/reports/sales
   * Reporte de ventas por período con desglose por medio de pago.
   */
  @Get('sales')
  async getSales(
    @Query('fromDate') fromDate: string | undefined,
    @Query('toDate') toDate: string | undefined,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getSalesReport({ fromDate, toDate });

    if (format === 'csv') {
      const csv = this.reportsService.exportSalesCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reporte_ventas_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      return res.send(csv);
    }

    return res.json({ success: true, data });
  }

  /**
   * GET /api/v1/reports/cash-summary
   * Reporte de resumen de caja y libro de ingresos/egresos por fecha.
   */
  @Get('cash-summary')
  async getCashSummary(
    @Query('fromDate') fromDate: string | undefined,
    @Query('toDate') toDate: string | undefined,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getCashSummaryReport({ fromDate, toDate });

    if (format === 'csv') {
      const csv = this.reportsService.exportCashSummaryCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reporte_caja_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      return res.send(csv);
    }

    return res.json({ success: true, data });
  }
}
