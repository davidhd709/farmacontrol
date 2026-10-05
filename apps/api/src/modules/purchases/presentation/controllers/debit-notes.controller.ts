import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
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

@Controller()
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class DebitNotesController {
  constructor(private readonly debitNotesService: DebitNotesService) {}

  @Post('purchases/:purchaseId/debit-notes')
  @RequirePermissions(SYSTEM_PERMISSIONS.PURCHASES_RECEIVE)
  async createForPurchase(
    @Param('purchaseId') purchaseId: string,
    @Body() payload: CreateDebitNotePayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<DebitNoteDto> {
    const userId = user.id || '00000000-0000-0000-0000-000000000000';
    return this.debitNotesService.createDebitNote(purchaseId, payload, userId);
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
