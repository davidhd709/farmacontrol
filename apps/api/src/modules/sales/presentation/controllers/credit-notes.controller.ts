import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
  Headers,
  ParseUUIDPipe,
  ConflictException,
} from '@nestjs/common';
import { CreditNotesService } from '../../application/credit-notes.service';
import {
  CreateCreditNotePayload,
  CreditNoteDto,
  SYSTEM_PERMISSIONS,
} from '@farmacia/contracts';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import { CreateCreditNoteValidationPipe } from '../dtos/create-credit-note.dto';
import { IdempotencyConflictException } from '../../domain/sale.exceptions';

@Controller()
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class CreditNotesController {
  constructor(private readonly creditNotesService: CreditNotesService) {}

  @Post('sales/:saleId/credit-notes')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE)
  async createForSale(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body(CreateCreditNoteValidationPipe) payload: CreateCreditNotePayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<CreditNoteDto> {
    try {
      return await this.creditNotesService.createCreditNote(
        saleId,
        { ...payload, saleId },
        user.id,
        idempotencyKey,
      );
    } catch (error) {
      if (error instanceof IdempotencyConflictException) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Get('sales/:saleId/credit-notes')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_READ)
  async listForSale(@Param('saleId') saleId: string): Promise<CreditNoteDto[]> {
    return this.creditNotesService.listCreditNotes(saleId);
  }

  @Get('credit-notes')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_READ)
  async listAll(@Query('saleId') saleId?: string): Promise<CreditNoteDto[]> {
    return this.creditNotesService.listCreditNotes(saleId);
  }

  @Get('credit-notes/:id')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_READ)
  async getById(@Param('id') id: string): Promise<CreditNoteDto> {
    return this.creditNotesService.getCreditNoteById(id);
  }
}
