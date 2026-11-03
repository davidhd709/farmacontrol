import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  type CreateCashReceiptPayload,
  type CancelTreasuryDocumentPayload,
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
 * Registro de recibos de caja y comprobantes de egreso (ADR-007). Cada documento tiene su
 * permiso (correcciones del cliente, 2026-11-02): el abono a cartera `recibo_caja.crear_abono`
 * y el comprobante de egreso `comprobante_egreso.crear`. El asiento automático que generan no
 * exige el permiso contable; un recibo o egreso manual sí, porque el usuario elige la
 * contrapartida, además del permiso de caja o bancos según el medio (lo valida el servicio).
 * Anular exige su propio permiso (`recibo_caja.anular` / `comprobante_egreso.anular`): crear no
 * basta, y cartera registra abonos pero no los anula.
 */
@Controller('treasury')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TreasuryVouchersController {
  constructor(private readonly vouchers: TreasuryVouchersService) {}

  /** Recibo de caja de abono a cartera: el cliente y las facturas a crédito que abona. */
  @Post('cash-receipts/collections')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_RECEIPTS_COLLECT)
  createCollectionReceipt(
    @Body() payload: CreateCashReceiptPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<TreasuryDocumentDto> {
    return this.vouchers.createCashReceipt({ ...payload, kind: 'CARTERA' }, user, idempotencyKey);
  }

  /** Recibo de caja manual (otros ingresos) contra la contrapartida elegida. */
  @Post('cash-receipts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_RECEIPTS_MANUAL)
  createCashReceipt(
    @Body() payload: CreateCashReceiptPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<TreasuryDocumentDto> {
    if (payload?.kind !== 'MANUAL') {
      throw new BadRequestException(
        'Esta ruta registra recibos manuales (kind MANUAL). El abono a cartera se registra en POST /api/v1/treasury/cash-receipts/collections.',
      );
    }
    return this.vouchers.createCashReceipt(payload, user, idempotencyKey);
  }

  @Post('disbursements')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.DISBURSEMENTS_CREATE)
  createDisbursement(
    @Body() payload: CreateDisbursementPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<TreasuryDocumentDto> {
    return this.vouchers.createDisbursement(payload, user, idempotencyKey);
  }

  /** Anula un recibo de abono a cartera: reversa sus abonos y saca el dinero recibido. */
  @Post('cash-receipts/collections/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_RECEIPTS_ANNUL)
  cancelCollectionReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: CancelTreasuryDocumentPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<TreasuryDocumentDto> {
    return this.vouchers.cancelDocument(id, payload?.reason, user, {
      documentType: 'RECIBO_CAJA',
      origins: ['CARTERA'],
    });
  }

  /** Anula un recibo manual: reversa su asiento y saca el dinero recibido. */
  @Post('cash-receipts/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.CASH_RECEIPTS_ANNUL, SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  cancelCashReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: CancelTreasuryDocumentPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<TreasuryDocumentDto> {
    return this.vouchers.cancelDocument(id, payload?.reason, user, {
      documentType: 'RECIBO_CAJA',
      origins: ['MANUAL'],
    });
  }

  /** Anula un comprobante de egreso: reversa sus pagos (o su asiento manual) y devuelve el dinero. */
  @Post('disbursements/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.DISBURSEMENTS_ANNUL)
  cancelDisbursement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: CancelTreasuryDocumentPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<TreasuryDocumentDto> {
    return this.vouchers.cancelDocument(id, payload?.reason, user, {
      documentType: 'COMPROBANTE_EGRESO',
      origins: ['PROVEEDOR', 'MANUAL'],
    });
  }
}
