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
import { PayablesService } from '../application/payables.service';
import {
  RegisterPayablePaymentPayload,
  ApiResponse,
  SYSTEM_PERMISSIONS,
} from '@farmacia/contracts';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../identity/presentation/guards/session-auth.guard';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

@Controller('payables')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class PayablesController {
  constructor(private readonly svc: PayablesService) {}

  /**
   * GET /api/v1/payables
   * Lista cuentas por pagar con filtros opcionales.
   */
  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.PAYABLES_READ)
  async findAll(
    @Query(
      new QueryShapeValidationPipe({
        supplierId: 'uuid?',
        status: 'text?',
        fromDate: 'date?',
        toDate: 'date?',
        overdueOnly: 'booleanString?',
      }),
    )
    query: Record<string, string>,
  ): Promise<ApiResponse<any>> {
    const data = await this.svc.findAll({
      supplierId: query['supplierId'],
      status: query['status'] as any,
      fromDate: query['fromDate'],
      toDate: query['toDate'],
      overdueOnly: query['overdueOnly'] === 'true',
      page: parsePaginationValue(query['page'], 'page'),
      pageSize: parsePaginationValue(query['pageSize'], 'pageSize'),
    });
    return { success: true, data };
  }

  /**
   * GET /api/v1/payables/aging-summary
   * Resumen de cartera por edades de vencimiento.
   */
  @Get('aging-summary')
  @RequirePermissions(SYSTEM_PERMISSIONS.PAYABLES_READ)
  async getAgingSummary(): Promise<ApiResponse<any>> {
    const data = await this.svc.getAgingSummary();
    return { success: true, data };
  }

  /**
   * GET /api/v1/payables/:id
   * Detalle de una cuenta por pagar con historial de pagos.
   */
  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.PAYABLES_READ)
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ApiResponse<any>> {
    const data = await this.svc.findById(id);
    return { success: true, data };
  }

  /**
   * POST /api/v1/payables/:id/payments
   * Registra un pago a la cuenta por pagar.
   * HU-021 CA-2
   */
  @Post(':id/payments')
  @RequirePermissions(SYSTEM_PERMISSIONS.PAYABLES_MANAGE)
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
    payload: RegisterPayablePaymentPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ApiResponse<any>> {
    const data = await this.svc.registerPayment(id, payload, user.id, idempotencyKey);
    return { success: true, data };
  }

  /**
   * POST /api/v1/payables/:id/payments/:paymentId/reverse
   * Revierte de forma controlada un pago registrado previamente.
   */
  @Post(':id/payments/:paymentId/reverse')
  @RequirePermissions(SYSTEM_PERMISSIONS.PAYABLES_MANAGE)
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
