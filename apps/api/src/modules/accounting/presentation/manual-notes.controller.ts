import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  type CreateManualNotePayload,
  type ManualNoteCreatedDto,
} from '@farmacia/contracts';
import { ManualNotesService } from '../application/manual-notes.service';
import { AccountingConflictError, AccountingValidationError } from '../domain/accounting-rules';
import { IdempotencyConflictException } from '../../sales/domain/sale.exceptions';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../../identity/presentation/guards/session-auth.guard';

@Controller('accounting/manual-notes')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ManualNotesController {
  constructor(private readonly manualNotesService: ManualNotesService) {}

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async create(
    @Body() body: CreateManualNotePayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ManualNoteCreatedDto> {
    try {
      return await this.manualNotesService.create(body, user.id, idempotencyKey);
    } catch (error) {
      if (error instanceof AccountingValidationError) throw new BadRequestException(error.message);
      if (error instanceof AccountingConflictError || error instanceof IdempotencyConflictException) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
