import { QueryFieldValidationPipe } from '../../../common/pagination/request-shape.pipe';
import { parsePaginationValue } from '../../../common/pagination/pagination';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
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
import {
  SessionAuthGuard,
  type AuthenticatedUserContext,
} from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequireAnyPermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';

/**
 * Quién consulta cada tipo (2026-11-03): el permiso contable ve ambos; tesorería ve los recibos
 * por `recibo_caja.crear_manual` y los egresos por `comprobante_egreso.crear`, sin contabilidad.
 */
function canReadDocumentType(permissions: readonly string[], type: string | undefined): boolean {
  if (permissions.includes(SYSTEM_PERMISSIONS.ACCOUNTING_READ)) return true;
  const receipts = permissions.includes(SYSTEM_PERMISSIONS.CASH_RECEIPTS_MANUAL);
  const disbursements = permissions.includes(SYSTEM_PERMISSIONS.DISBURSEMENTS_CREATE);
  if (type === 'RECIBO_CAJA') return receipts;
  if (type === 'COMPROBANTE_EGRESO') return disbursements;
  // Sin filtro de tipo: solo quien puede leer los dos
  return receipts && disbursements;
}

const READ_DOCUMENTS = [
  SYSTEM_PERMISSIONS.ACCOUNTING_READ,
  SYSTEM_PERMISSIONS.CASH_RECEIPTS_MANUAL,
  SYSTEM_PERMISSIONS.DISBURSEMENTS_CREATE,
];

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
  @RequireAnyPermissions(...READ_DOCUMENTS)
  async list(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query('type', new QueryFieldValidationPipe('type', 'text?')) type?: TreasuryDocumentType,
    @Query('fromDate', new QueryFieldValidationPipe('fromDate', 'date?')) fromDate?: string,
    @Query('toDate', new QueryFieldValidationPipe('toDate', 'date?')) toDate?: string,
    @Query('search', new QueryFieldValidationPipe('search', 'text?')) search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<TreasuryDocumentDto>> {
    if (!canReadDocumentType(user.permissions, type)) {
      throw new ForbiddenException('No tiene permiso para consultar ese tipo de documento.');
    }
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
  @RequireAnyPermissions(...READ_DOCUMENTS)
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<TreasuryDocumentDto> {
    const doc = await this.documentsService.getById(id).catch(toHttp);
    if (!canReadDocumentType(user.permissions, doc.documentType)) {
      throw new ForbiddenException('No tiene permiso para consultar ese tipo de documento.');
    }
    return doc;
  }
}
