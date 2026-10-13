import {
  RequestShapeValidationPipe,
  RequestFieldValidationPipe,
  QueryShapeValidationPipe,
} from '../../../common/pagination/request-shape.pipe';
import { parsePaginationValue } from '../../../common/pagination/pagination';
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ReceivablesService } from '../application/receivables.service';
import {
  RegisterReceivablePaymentPayload,
  ApiResponse,
  SYSTEM_PERMISSIONS,
  RECEIVABLE_STATUSES,
  ReceivableStatus,
} from '@farmacia/contracts';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../identity/presentation/guards/session-auth.guard';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

@Controller('receivables')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ReceivablesController {
  constructor(private readonly svc: ReceivablesService) {}

  /**
   * GET /api/v1/receivables
   * Lista cuentas por cobrar con filtros opcionales.
   */
  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.RECEIVABLES_READ)
  async findAll(
    @Query(
      new QueryShapeValidationPipe({
        customerId: 'uuid?',
        // FARM-AUD-003: solo estados del contrato; un valor ajeno responde 400 en vez de lista vacía
        status: { values: RECEIVABLE_STATUSES, optional: true },
        fromDate: 'date?',
        toDate: 'date?',
        overdueOnly: 'booleanString?',
      }),
    )
    query: Record<string, string>,
  ): Promise<ApiResponse<any>> {
    const data = await this.svc.findAll({
      customerId: query['customerId'],
      status: query['status'] as ReceivableStatus | undefined,
      fromDate: query['fromDate'],
      toDate: query['toDate'],
      overdueOnly: query['overdueOnly'] === 'true',
      page: parsePaginationValue(query['page'], 'page'),
      pageSize: parsePaginationValue(query['pageSize'], 'pageSize'),
    });
    return { success: true, data };
  }

  /**
   * GET /api/v1/receivables/aging-summary
   * Resumen de cartera por edades de vencimiento.
   */
  @Get('aging-summary')
  @RequirePermissions(SYSTEM_PERMISSIONS.RECEIVABLES_READ)
  async getAgingSummary(): Promise<ApiResponse<any>> {
    const data = await this.svc.getAgingSummary();
    return { success: true, data };
  }

  /**
   * GET /api/v1/receivables/:id
   * Detalle de una cuenta por cobrar con historial de pagos.
   */
  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.RECEIVABLES_READ)
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ApiResponse<any>> {
    const data = await this.svc.findById(id);
    return { success: true, data };
  }

  /**
   * POST /api/v1/receivables/:id/payments
   * Registra un abono a la cuenta por cobrar.
   * HU-020 CA-2
   */
  @Post(':id/payments')
  @RequirePermissions(SYSTEM_PERMISSIONS.RECEIVABLES_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  async registerPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new RequestShapeValidationPipe({
        amount: 'decimal',
        paymentMethod: 'text?',
        bankAccountId: 'uuid?',
        notes: 'text?',
      }),
    )
    payload: RegisterReceivablePaymentPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ApiResponse<any>> {
    const data = await this.svc.registerPayment(id, payload, user.id, idempotencyKey);
    return { success: true, data };
  }

  /**
   * POST /api/v1/receivables/:id/payments/:paymentId/reverse
   * Revierte de forma controlada un abono registrado previamente.
   */
  @Post(':id/payments/:paymentId/reverse')
  @RequirePermissions(SYSTEM_PERMISSIONS.RECEIVABLES_MANAGE)
  @HttpCode(HttpStatus.OK)
  async revertPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body('reason', new RequestFieldValidationPipe('reason', 'text')) reason: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ApiResponse<any>> {
    const data = await this.svc.revertPayment(id, paymentId, reason, user.id);
    return { success: true, data };
  }
}
