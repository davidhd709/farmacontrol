import { businessToday } from '../../../common/utils/business-date';
import { QueryFieldValidationPipe } from '../../../common/pagination/request-shape.pipe';
import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { TopProductsSortBy } from '@farmacia/contracts';
import type { Response } from 'express';
import { ReportsService } from '../application/reports.service';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

@ApiTags('reports')
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
    @Query('format', new QueryFieldValidationPipe('format', 'text?')) format: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getInventoryValuationReport();

    if (format === 'csv') {
      const csv = this.reportsService.exportInventoryValuationCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reporte_inventario_valorizado_${businessToday()}.csv"`,
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
    @Query('format', new QueryFieldValidationPipe('format', 'text?')) format: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getExpirationsReport();

    if (format === 'csv') {
      const csv = this.reportsService.exportExpirationsCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reporte_vencimientos_${businessToday()}.csv"`,
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
    @Query('format', new QueryFieldValidationPipe('format', 'text?')) format: string | undefined,
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
    @Query('fromDate', new QueryFieldValidationPipe('fromDate', 'date?'))
    fromDate: string | undefined,
    @Query('toDate', new QueryFieldValidationPipe('toDate', 'date?')) toDate: string | undefined,
    @Query('format', new QueryFieldValidationPipe('format', 'text?')) format: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getSalesReport({ fromDate, toDate });

    if (format === 'csv') {
      const csv = this.reportsService.exportSalesCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reporte_ventas_${businessToday()}.csv"`,
      );
      return res.send(csv);
    }

    return res.json({ success: true, data });
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Productos más vendidos, netos de devoluciones del período' })
  @ApiQuery({ name: 'fromDate', required: false, type: String, example: '2026-10-01' })
  @ApiQuery({ name: 'toDate', required: false, type: String, example: '2026-10-31' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['units', 'value'],
    schema: { default: 'units' },
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100, example: 20 })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  @ApiResponse({ status: 200, description: 'Ranking en JSON o CSV' })
  @ApiResponse({ status: 400, description: 'Filtros inválidos' })
  @ApiResponse({ status: 403, description: 'Requiere reports:read' })
  async getTopProducts(
    @Query('fromDate', new QueryFieldValidationPipe('fromDate', 'date?'))
    fromDate: string | undefined,
    @Query('toDate', new QueryFieldValidationPipe('toDate', 'date?')) toDate: string | undefined,
    @Query(
      'sortBy',
      new QueryFieldValidationPipe('sortBy', { values: ['units', 'value'], optional: true }),
    )
    sortBy: TopProductsSortBy | undefined,
    @Query('limit', new QueryFieldValidationPipe('limit', 'integerString?'))
    limit: string | undefined,
    @Query('format', new QueryFieldValidationPipe('format', 'text?')) format: string | undefined,
    @Res() res: Response,
  ) {
    const parsedLimit = limit === undefined ? 20 : Number(limit);
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('limit debe estar entre 1 y 100.');
    }
    const data = await this.reportsService.getTopProductsReport({
      fromDate,
      toDate,
      sortBy,
      limit: parsedLimit,
    });
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="productos_mas_vendidos_${businessToday()}.csv"`,
      );
      return res.send(this.reportsService.exportTopProductsCsv(data));
    }
    return res.json({ success: true, data });
  }

  /**
   * GET /api/v1/reports/cash-summary
   * Reporte de resumen de caja y libro de ingresos/egresos por fecha.
   */
  @Get('cash-summary')
  async getCashSummary(
    @Query('fromDate', new QueryFieldValidationPipe('fromDate', 'date?'))
    fromDate: string | undefined,
    @Query('toDate', new QueryFieldValidationPipe('toDate', 'date?')) toDate: string | undefined,
    @Query('format', new QueryFieldValidationPipe('format', 'text?')) format: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getCashSummaryReport({ fromDate, toDate });

    if (format === 'csv') {
      const csv = this.reportsService.exportCashSummaryCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reporte_caja_${businessToday()}.csv"`,
      );
      return res.send(csv);
    }

    return res.json({ success: true, data });
  }
}
