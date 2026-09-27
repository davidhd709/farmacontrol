import {
  Controller,
  Get,
  Post,
  Param,
  Body,
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
} from '@farmacia/contracts';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../identity/presentation/guards/session-auth.guard';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';

@Controller('payables')
@UseGuards(SessionAuthGuard)
export class PayablesController {
  constructor(private readonly svc: PayablesService) {}

  /**
   * GET /api/v1/payables
   * Lista cuentas por pagar con filtros opcionales.
   */
  @Get()
  async findAll(@Query() query: Record<string, string>): Promise<ApiResponse<any>> {
    const data = await this.svc.findAll({
      supplierId: query['supplierId'],
      status: query['status'] as any,
      fromDate: query['fromDate'],
      toDate: query['toDate'],
      overdueOnly: query['overdueOnly'] === 'true',
      page: query['page'] ? parseInt(query['page'], 10) : undefined,
      pageSize: query['pageSize'] ? parseInt(query['pageSize'], 10) : undefined,
    });
    return { success: true, data };
  }

  /**
   * GET /api/v1/payables/:id
   * Detalle de una cuenta por pagar con historial de pagos.
   */
  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiResponse<any>> {
    const data = await this.svc.findById(id);
    return { success: true, data };
  }

  /**
   * POST /api/v1/payables/:id/payments
   * Registra un pago a la cuenta por pagar.
   * HU-021 CA-2
   */
  @Post(':id/payments')
  @HttpCode(HttpStatus.CREATED)
  async registerPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: RegisterPayablePaymentPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ApiResponse<any>> {
    const data = await this.svc.registerPayment(id, payload, user.id);
    return { success: true, data };
  }
}
