import {
  QueryFieldValidationPipe,
  RequestShapeValidationPipe,
} from '../../../../common/pagination/request-shape.pipe';
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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CreditNotesService } from '../../application/credit-notes.service';
import {
  CancelCreditNotePayload,
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

  @Get('sales/:saleId/credit-notes')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_READ)
  async listForSale(@Param('saleId', ParseUUIDPipe) saleId: string): Promise<CreditNoteDto[]> {
    return this.creditNotesService.listCreditNotes(saleId);
  }

  @Get('credit-notes')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_READ)
  async listAll(
    @Query('saleId', new QueryFieldValidationPipe('saleId', 'uuid?')) saleId?: string,
  ): Promise<CreditNoteDto[]> {
    return this.creditNotesService.listCreditNotes(saleId);
  }

  @Get('credit-notes/:id')
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_READ)
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<CreditNoteDto> {
    return this.creditNotesService.getCreditNoteById(id);
  }

  /**
   * Anula la devolución: la mercancía vuelve a salir, el reembolso se deshace y se reversa el
   * asiento (correcciones del cliente, 2026-11-02). Mismo permiso que anular una venta.
   */
  @Post('credit-notes/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.SALES_CANCEL)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new RequestShapeValidationPipe({ reason: 'text' })) payload: CancelCreditNotePayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<CreditNoteDto> {
    return this.creditNotesService.cancelCreditNote(id, payload, user.id);
  }
}
