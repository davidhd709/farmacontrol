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
  JournalEntryDto,
  JournalEntryQueryFilters,
  ReverseJournalEntryPayload,
  PaginatedResponse,
} from '@farmacia/contracts';
import { JournalService } from '../application/journal.service';
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

@Controller('journal-entries')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async findAll(@Query() query: JournalEntryQueryFilters): Promise<PaginatedResponse<JournalEntryDto>> {
    try {
      return await this.journalService.findAll(query);
    } catch (error) {
      handleHttpError(error);
    }
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async findById(@Param('id') id: string): Promise<JournalEntryDto> {
    try {
      return await this.journalService.findById(id);
    } catch (error) {
      handleHttpError(error);
    }
  }

  @Post(':id/reverse')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async reverse(
    @Param('id') id: string,
    @Body() body: ReverseJournalEntryPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<JournalEntryDto> {
    try {
      const entryDate = body.entryDate || new Date().toISOString().slice(0, 10);
      const reversed = await this.journalService.reverse({
        entryId: id,
        entryDate,
        reason: body.reason,
        createdById: user.id,
      });
      return await this.journalService.findById(reversed.id);
    } catch (error) {
      handleHttpError(error);
    }
  }
}
