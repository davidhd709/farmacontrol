import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  TrialBalanceReportDto,
  GeneralLedgerReportDto,
} from '@farmacia/contracts';
import { AccountingReportsService } from '../application/reports.service';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

@Controller('accounting/reports')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AccountingReportsController {
  constructor(private readonly reportsService: AccountingReportsService) {}

  @Get('trial-balance')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async getTrialBalance(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ): Promise<TrialBalanceReportDto> {
    if (!fromDate || !toDate) {
      throw new BadRequestException('fromDate y toDate son obligatorios.');
    }
    return this.reportsService.getTrialBalance(fromDate, toDate);
  }

  @Get('general-ledger')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async getGeneralLedger(
    @Query('accountId') accountId: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ): Promise<GeneralLedgerReportDto> {
    if (!accountId || !fromDate || !toDate) {
      throw new BadRequestException('accountId, fromDate y toDate son obligatorios.');
    }
    return this.reportsService.getGeneralLedger(accountId, fromDate, toDate);
  }
}
