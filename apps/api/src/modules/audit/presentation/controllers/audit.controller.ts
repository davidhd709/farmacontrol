import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  AuditEventDto,
  AuditMetadataDto,
  AuditQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { AuditService } from '../../application/services/audit.service';
import { SessionAuthGuard } from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { AuditQueryValidationPipe } from '../dtos/audit-query.dto';

@Controller('audit')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /api/v1/audit/events
   * Lista paginada de eventos de auditoría con filtros por fecha, entidad, acción, usuario o correlationId.
   */
  @Get('events')
  @RequirePermissions(SYSTEM_PERMISSIONS.AUDIT_READ)
  public async getEvents(
    @Query(AuditQueryValidationPipe) query: AuditQueryFilters,
  ): Promise<PaginatedResponse<AuditEventDto>> {
    return this.auditService.findPaginated(query);
  }

  /**
   * GET /api/v1/audit/metadata
   * Obtiene la lista de entidades y acciones únicas registradas para poblar filtros en UI.
   */
  @Get('metadata')
  @RequirePermissions(SYSTEM_PERMISSIONS.AUDIT_READ)
  public async getMetadata(): Promise<AuditMetadataDto> {
    return this.auditService.getMetadata();
  }

  /**
   * GET /api/v1/audit/events/:id
   * Obtiene el detalle completo de un evento de auditoría incluyendo su carga JSONB y datos del usuario actor.
   */
  @Get('events/:id')
  @RequirePermissions(SYSTEM_PERMISSIONS.AUDIT_READ)
  public async getEventById(@Param('id') id: string): Promise<AuditEventDto> {
    const event = await this.auditService.findByIdWithUser(id);
    if (!event) {
      throw new NotFoundException(`Evento de auditoría con ID '${id}' no encontrado.`);
    }
    return event;
  }
}
