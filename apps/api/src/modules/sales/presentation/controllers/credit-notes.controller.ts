import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
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

@Controller()
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class CreditNotesController {
  constructor(private readonly creditNotesService: CreditNotesService) {}

  @Post('sales/:saleId/credit-notes')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_CREATE)
  async createForSale(
    @Param('saleId') saleId: string,
    @Body() payload: CreateCreditNotePayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<CreditNoteDto> {
    const userId = user.id || '00000000-0000-0000-0000-000000000000';
    return this.creditNotesService.createCreditNote(saleId, payload, userId);
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
