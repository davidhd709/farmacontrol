import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  SYSTEM_PERMISSIONS,
  TrialBalanceReportDto,
  GeneralLedgerReportDto,
  IncomeStatementReportDto,
  BalanceSheetReportDto,
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

  @Get('income-statement')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async getIncomeStatement(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ): Promise<IncomeStatementReportDto> {
    if (!fromDate || !toDate) {
      throw new BadRequestException('fromDate y toDate son obligatorios.');
    }
    return this.reportsService.getIncomeStatement(fromDate, toDate);
  }

  @Get('balance-sheet')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async getBalanceSheet(
    @Query('asOfDate') asOfDate: string,
  ): Promise<BalanceSheetReportDto> {
    if (!asOfDate) {
      throw new BadRequestException('asOfDate es obligatorio.');
    }
    return this.reportsService.getBalanceSheet(asOfDate);
  }

  @Get('trial-balance/export')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async exportTrialBalance(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!fromDate || !toDate) {
      throw new BadRequestException('fromDate y toDate son obligatorios.');
    }
    const buffer = await this.reportsService.exportTrialBalanceToExcel(fromDate, toDate);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="balance_comprobacion_${fromDate}_${toDate}.xlsx"`,
    );
    res.send(buffer);
  }

  @Get('income-statement/export')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async exportIncomeStatement(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!fromDate || !toDate) {
      throw new BadRequestException('fromDate y toDate son obligatorios.');
    }
    const buffer = await this.reportsService.exportIncomeStatementToExcel(fromDate, toDate);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="estado_resultados_${fromDate}_${toDate}.xlsx"`,
    );
    res.send(buffer);
  }

  @Get('balance-sheet/export')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async exportBalanceSheet(
    @Query('asOfDate') asOfDate: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!asOfDate) {
      throw new BadRequestException('asOfDate es obligatorio.');
    }
    const buffer = await this.reportsService.exportBalanceSheetToExcel(asOfDate);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="balance_general_${asOfDate}.xlsx"`,
    );
    res.send(buffer);
  }
}

