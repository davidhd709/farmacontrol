import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  FiscalPeriodDto,
  FiscalPeriodStatus,
  GenerateFiscalPeriodsPayload,
  CloseFiscalPeriodPayload,
  ReopenFiscalPeriodPayload,
} from '@farmacia/contracts';
import { FiscalPeriodsService } from '../application/fiscal-periods.service';
import {
  AccountingConflictError,
  AccountingNotFoundError,
  AccountingValidationError,
} from '../domain/accounting-rules';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../../identity/presentation/guards/session-auth.guard';

function handleHttpError(error: unknown): never {
  if (error instanceof AccountingNotFoundError) throw new NotFoundException(error.message);
  if (error instanceof AccountingConflictError) throw new ConflictException(error.message);
  if (error instanceof AccountingValidationError) throw new BadRequestException(error.message);
  throw error;
}

@Controller('accounting/periods')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class FiscalPeriodsController {
  constructor(private readonly fiscalPeriodsService: FiscalPeriodsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async listPeriods(
    @Query('year') year?: string,
    @Query('status') status?: FiscalPeriodStatus,
  ): Promise<FiscalPeriodDto[]> {
    try {
      const yearNum = year ? parseInt(year, 10) : undefined;
      return await this.fiscalPeriodsService.listPeriods({
        year: Number.isNaN(yearNum) ? undefined : yearNum,
        status,
      });
    } catch (error) {
      handleHttpError(error);
    }
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async getPeriodById(@Param('id') id: string): Promise<FiscalPeriodDto> {
    try {
      return await this.fiscalPeriodsService.getPeriodById(id);
    } catch (error) {
      handleHttpError(error);
    }
  }

  @Post('generate')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async generateYearPeriods(
    @Body() body: GenerateFiscalPeriodsPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FiscalPeriodDto[]> {
    try {
      return await this.fiscalPeriodsService.generateYearPeriods(body.year, user.id);
    } catch (error) {
      handleHttpError(error);
    }
  }

  @Post(':id/close')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async closePeriod(
    @Param('id') id: string,
    @Body() body: CloseFiscalPeriodPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FiscalPeriodDto> {
    try {
      return await this.fiscalPeriodsService.closePeriod(id, body, user.id);
    } catch (error) {
      handleHttpError(error);
    }
  }

  @Post(':id/reopen')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async reopenPeriod(
    @Param('id') id: string,
    @Body() body: ReopenFiscalPeriodPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FiscalPeriodDto> {
    try {
      return await this.fiscalPeriodsService.reopenPeriod(id, body, user.id);
    } catch (error) {
      handleHttpError(error);
    }
  }
}
