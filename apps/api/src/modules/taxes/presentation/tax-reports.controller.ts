import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import {
  SYSTEM_PERMISSIONS,
  type ExogenousDraftDto,
  type IcaDraftDto,
  type VatDraftDto,
  type WithholdingDraftDto,
} from '@farmacia/contracts';
import { TaxReportsService } from '../application/tax-reports.service';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

/** Borradores tributarios para la contadora (ADR-006, F8); no son el formulario oficial. */
@Controller('tax-reports')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TaxReportsController {
  constructor(private readonly reports: TaxReportsService) {}

  @Get('vat')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Borrador del formulario 300 (IVA) del período' })
  vat(@Query('from') from: string, @Query('to') to: string): Promise<VatDraftDto> {
    return this.reports.vat(from, to);
  }

  @Get('withholdings')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Borrador del formulario 350 (retenciones practicadas) del período' })
  withholdings(@Query('from') from: string, @Query('to') to: string): Promise<WithholdingDraftDto> {
    return this.reports.withholdings(from, to);
  }

  @Get('ica')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Borrador de ICA del período' })
  ica(@Query('from') from: string, @Query('to') to: string): Promise<IcaDraftDto> {
    return this.reports.ica(from, to);
  }

  @Get('exogenous')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Borrador de información exógena (formatos 1001 y 1007) del año' })
  exogenous(@Query('year') year: string): Promise<ExogenousDraftDto> {
    return this.reports.exogenous(year);
  }
}
