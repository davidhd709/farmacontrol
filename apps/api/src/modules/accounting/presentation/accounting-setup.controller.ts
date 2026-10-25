import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  SYSTEM_PERMISSIONS,
  type AccountingSetupDto,
  type ApplyPucTemplateResultDto,
  type CreateOpeningBalancePayload,
  type OpeningBalanceDto,
} from '@farmacia/contracts';
import { AccountingSetupService } from '../application/accounting-setup.service';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../../identity/presentation/guards/session-auth.guard';

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
  }
  return value as Record<string, unknown>;
}

/** Asistente de configuración contable: plantilla PUC, saldos de apertura y READY (F7). */
@Controller('accounting')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AccountingSetupController {
  constructor(private readonly setup: AccountingSetupService) {}

  @Get('setup')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  @ApiOperation({
    summary: 'Lista de verificación de la configuración contable (READY o INCOMPLETE)',
  })
  status(): Promise<AccountingSetupDto> {
    return this.setup.status();
  }

  @Post('setup/apply-template')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  @ApiOperation({
    summary:
      'Aplica la plantilla PUC del perfil: crea cuentas faltantes y mapea propósitos sin cuenta',
  })
  applyTemplate(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ApplyPucTemplateResultDto> {
    return this.setup.applyTemplate(objectBody(body ?? {}).template, user.id);
  }

  @Get('opening-balances')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Saldos de apertura vigentes, o null si no se han registrado' })
  async openingBalance(): Promise<OpeningBalanceDto | { journalEntryId: null }> {
    return (await this.setup.getOpeningBalance()) ?? { journalEntryId: null };
  }

  @Post('opening-balances')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  @ApiOperation({ summary: 'Registra los saldos de apertura como un asiento cuadrado' })
  @ApiResponse({ status: 409, description: 'Ya hay saldos de apertura vigentes.' })
  createOpeningBalance(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<OpeningBalanceDto> {
    return this.setup.createOpeningBalance(
      objectBody(body) as unknown as CreateOpeningBalancePayload,
      user.id,
    );
  }
}
