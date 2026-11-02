import {
  RequestShapeValidationPipe,
  QueryShapeValidationPipe,
} from '../../../common/pagination/request-shape.pipe';
import { PaginationQueryPipe } from '../../../common/pagination/pagination';
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
  ParseUUIDPipe,
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
import { businessToday } from '../../../common/utils/business-date';
import { retiredRoute } from '../../../common/http/retired-route';

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
  async findAll(
    @Query(
      new QueryShapeValidationPipe({
        fromDate: 'date?',
        toDate: 'date?',
        sourceType: 'text?',
        status: 'text?',
        search: 'text?',
      }),
      PaginationQueryPipe,
    )
    query: JournalEntryQueryFilters,
  ): Promise<PaginatedResponse<JournalEntryDto>> {
    try {
      return await this.journalService.findAll(query);
    } catch (error) {
      handleHttpError(error);
    }
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<JournalEntryDto> {
    try {
      return await this.journalService.findById(id);
    } catch (error) {
      handleHttpError(error);
    }
  }

  /** Retirada: las correcciones se hacen anulando el documento de origen. */
  @Post(':id/reverse')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  reverse(): never {
    return retiredRoute(
      'POST /api/v1/journal-entries/:id/reverse',
      'Anule el documento de origen; las notas contables manuales, los saldos iniciales y el cierre anual se anulan con POST /api/v1/journal-entries/:id/annul.',
    );
  }

  /** Anula una nota contable manual, un saldo inicial o un cierre anual (con permiso contable). */
  @Post(':id/annul')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE)
  async annul(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new RequestShapeValidationPipe({ entryDate: 'date?', reason: 'text' }))
    body: ReverseJournalEntryPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<JournalEntryDto> {
    try {
      // Sin fecha, la anulación queda con el día de Bogotá (de noche la fecha UTC ya es mañana)
      const entryDate = body.entryDate || businessToday();
      const reversed = await this.journalService.annul({
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
