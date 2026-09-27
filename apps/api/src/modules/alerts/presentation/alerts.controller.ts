import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AlertsService } from '../application/alerts.service';
import {
  ApiResponse,
  SYSTEM_PERMISSIONS,
  ExpirationSeverity,
} from '@farmacia/contracts';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

@Controller('alerts')
@UseGuards(SessionAuthGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  /**
   * GET /api/v1/alerts/expirations
   * Expone la lista paginada y filtrable de lotes en riesgo de vencimiento (UX-14).
   */
  @Get('expirations')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(
    SYSTEM_PERMISSIONS.INVENTORY_READ,
    SYSTEM_PERMISSIONS.ALERTS_READ,
  )
  async getExpirations(
    @Query('severity') severity?: ExpirationSeverity,
    @Query('search') search?: string,
    @Query('locationId') locationId?: string,
    @Query('isResolved') isResolved?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ApiResponse<any>> {
    const data = await this.alertsService.getExpirationAlerts({
      severity,
      search,
      locationId,
      isResolved: isResolved !== undefined ? isResolved === 'true' : false,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return { success: true, data };
  }

  /**
   * GET /api/v1/alerts/summary
   * Resumen liviano de alertas para consumo rápido en Topbar y Dashboard.
   * Accesible para todos los usuarios con sesión activa.
   */
  @Get('summary')
  async getSummary(): Promise<ApiResponse<any>> {
    const data = await this.alertsService.getAlertsSummary();
    return { success: true, data };
  }

  /**
   * POST /api/v1/alerts/evaluate
   * Ejecuta inmediatamente el escaneo de vencimientos y generación de alertas.
   */
  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(SYSTEM_PERMISSIONS.ALERTS_MANAGE)
  async triggerEvaluation(
    @Body('referenceDate') referenceDateStr?: string,
  ): Promise<ApiResponse<any>> {
    const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
    const data = await this.alertsService.evaluateLotsExpirations(refDate);
    return { success: true, data };
  }

  /**
   * POST /api/v1/alerts/jobs
   * Encola un trabajo de evaluación en PostgreSQL para ser consumido por el worker.
   */
  @Post('jobs')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(SYSTEM_PERMISSIONS.ALERTS_MANAGE)
  async enqueueJob(
    @Body('priority') priority?: number,
  ): Promise<ApiResponse<any>> {
    const data = await this.alertsService.enqueueEvaluationJob(priority || 0);
    return { success: true, data };
  }

  /**
   * GET /api/v1/alerts/jobs
   * Consulta el historial reciente de trabajos en segundo plano.
   */
  @Get('jobs')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(SYSTEM_PERMISSIONS.ALERTS_MANAGE)
  async getJobs(@Query('limit') limit?: string): Promise<ApiResponse<any>> {
    const data = await this.alertsService.getBackgroundJobs(
      limit ? parseInt(limit, 10) : 20,
    );
    return { success: true, data };
  }
}
