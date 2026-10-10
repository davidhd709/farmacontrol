import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  type AnnualClosingPreviewDto,
  type AnnualClosingResultDto,
} from '@farmacia/contracts';
import { AnnualClosingService } from '../application/annual-closing.service';
import { AccountingConflictError, AccountingValidationError } from '../domain/accounting-rules';
import { IdempotencyConflictException } from '../../sales/domain/sale.exceptions';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../../identity/presentation/guards/session-auth.guard';

function handle(error: unknown): never {
  if (error instanceof AccountingValidationError) throw new BadRequestException(error.message);
  if (error instanceof AccountingConflictError || error instanceof IdempotencyConflictException) {
    throw new ConflictException(error.message);
  }
  throw error;
}

@Controller('accounting/annual-closings')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AnnualClosingController {
  constructor(private readonly annualClosingService: AnnualClosingService) {}

  /** Muestra el asiento que se generaría, antes de confirmarlo. */
  @Get('preview')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async preview(@Query('year') year: string): Promise<AnnualClosingPreviewDto> {
    try {
      return await this.annualClosingService.preview(Number(year));
    } catch (error) {
      handle(error);
    }
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async close(
    @Body() body: { year: number },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<AnnualClosingResultDto> {
    try {
      return await this.annualClosingService.close(Number(body?.year), user.id, idempotencyKey);
    } catch (error) {
      handle(error);
    }
  }
}
