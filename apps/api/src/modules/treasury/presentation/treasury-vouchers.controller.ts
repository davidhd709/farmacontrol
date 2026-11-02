import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  type CreateCashReceiptPayload,
  type CreateDisbursementPayload,
  type TreasuryDocumentDto,
} from '@farmacia/contracts';
import { TreasuryVouchersService } from '../application/treasury-vouchers.service';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../identity/presentation/guards/session-auth.guard';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

/**
 * Registro de recibos de caja y comprobantes de egreso (ADR-007). Además del permiso contable
 * de la pantalla, el servicio exige el del tipo de documento y del medio (cartera, proveedores,
 * gastos, caja o bancos).
 */
@Controller('treasury')
@UseGuards(SessionAuthGuard, PermissionsGuard)
@RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
export class TreasuryVouchersController {
  constructor(private readonly vouchers: TreasuryVouchersService) {}

  @Post('cash-receipts')
  @HttpCode(HttpStatus.CREATED)
  createCashReceipt(
    @Body() payload: CreateCashReceiptPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<TreasuryDocumentDto> {
    return this.vouchers.createCashReceipt(payload, user, idempotencyKey);
  }

  @Post('disbursements')
  @HttpCode(HttpStatus.CREATED)
  createDisbursement(
    @Body() payload: CreateDisbursementPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<TreasuryDocumentDto> {
    return this.vouchers.createDisbursement(payload, user, idempotencyKey);
  }
}
