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
import { DebitNotesService } from '../../application/debit-notes.service';
import {
  CreateDebitNotePayload,
  DebitNoteDto,
  SYSTEM_PERMISSIONS,
} from '@farmacia/contracts';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import { CreateDebitNoteValidationPipe } from '../dtos/create-debit-note.dto';
import { IdempotencyConflictException } from '../../../sales/domain/sale.exceptions';

@Controller()
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class DebitNotesController {
  constructor(private readonly debitNotesService: DebitNotesService) {}

  @Post('purchases/:purchaseId/debit-notes')
  @RequirePermissions(SYSTEM_PERMISSIONS.PURCHASES_DEBIT_NOTE)
  async createForPurchase(
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @Body(CreateDebitNoteValidationPipe) payload: CreateDebitNotePayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<DebitNoteDto> {
    try {
      return await this.debitNotesService.createDebitNote(
        purchaseId,
        payload,
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

  @Get('purchases/:purchaseId/debit-notes')
  @RequirePermissions(SYSTEM_PERMISSIONS.PURCHASES_READ)
  async listForPurchase(@Param('purchaseId') purchaseId: string): Promise<DebitNoteDto[]> {
    return this.debitNotesService.listDebitNotes(purchaseId);
  }

  @Get('debit-notes')
  @RequirePermissions(SYSTEM_PERMISSIONS.PURCHASES_READ)
  async listAll(@Query('purchaseId') purchaseId?: string): Promise<DebitNoteDto[]> {
    return this.debitNotesService.listDebitNotes(purchaseId);
  }

  @Get('debit-notes/:id')
  @RequirePermissions(SYSTEM_PERMISSIONS.PURCHASES_READ)
  async getById(@Param('id') id: string): Promise<DebitNoteDto> {
    return this.debitNotesService.getDebitNoteById(id);
  }
}
