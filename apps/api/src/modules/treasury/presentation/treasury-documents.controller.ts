import { QueryFieldValidationPipe } from '../../../common/pagination/request-shape.pipe';
import { parsePaginationValue } from '../../../common/pagination/pagination';
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  type PaginatedResponse,
  type TreasuryDocumentDto,
  type TreasuryDocumentType,
} from '@farmacia/contracts';
import { TreasuryDocumentsService } from '../application/treasury-documents.service';
import { TreasuryNotFoundError, TreasuryValidationError } from '../domain/treasury-rules';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

function toHttp(error: unknown): never {
  if (error instanceof TreasuryValidationError) throw new BadRequestException(error.message);
  if (error instanceof TreasuryNotFoundError) throw new NotFoundException(error.message);
  throw error;
}

/** Recibos de caja y comprobantes de egreso: documentos contables de solo lectura. */
@Controller('treasury/documents')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class TreasuryDocumentsController {
  constructor(private readonly documentsService: TreasuryDocumentsService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async list(
    @Query('type', new QueryFieldValidationPipe('type', 'text?')) type?: TreasuryDocumentType,
    @Query('fromDate', new QueryFieldValidationPipe('fromDate', 'date?')) fromDate?: string,
    @Query('toDate', new QueryFieldValidationPipe('toDate', 'date?')) toDate?: string,
    @Query('search', new QueryFieldValidationPipe('search', 'text?')) search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<TreasuryDocumentDto>> {
    try {
      return await this.documentsService.list({
        type,
        fromDate,
        toDate,
        search,
        page: parsePaginationValue(page, 'page'),
        pageSize: parsePaginationValue(pageSize, 'pageSize'),
      });
    } catch (error) {
      toHttp(error);
    }
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<TreasuryDocumentDto> {
    try {
      return await this.documentsService.getById(id);
    } catch (error) {
      toHttp(error);
    }
  }
}
