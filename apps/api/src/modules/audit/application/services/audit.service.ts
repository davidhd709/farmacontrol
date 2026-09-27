import { Inject, Injectable, Logger } from '@nestjs/common';
import { RecordAuditEventPayload } from '@farmacia/contracts';
import {
  AUDIT_EVENT_REPOSITORY_PORT,
  AuditEventRepositoryPort,
  AuditFindFilters,
} from '../ports/audit-event.repository.port';
import { AuditEvent } from '../../domain/entities/audit-event.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY_PORT)
    private readonly auditRepository: AuditEventRepositoryPort
  ) {}

  /**
   * Registra un evento de auditoría inmutable.
   * Si se provee un cliente transaccional (tx), la persistencia del evento se ejecuta
   * dentro de dicha transacción para garantizar atomicidad con la mutación de negocio.
   */
  public async recordEvent(
    input: RecordAuditEventPayload,
    tx?: unknown
  ): Promise<AuditEvent> {
    const event = AuditEvent.create({
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      details: input.details,
      ipAddress: input.ipAddress,
      correlationId: input.correlationId,
    });

    await this.auditRepository.save(event, tx);

    this.logger.log(
      `[Audit] ${event.action} | entity=${event.entity}:${event.entityId ?? 'none'} | user=${event.userId ?? 'system'} | corr=${event.correlationId ?? 'none'}`
    );

    return event;
  }

  public async findById(id: string): Promise<AuditEvent | null> {
    return this.auditRepository.findById(id);
  }

  public async findByCorrelationId(correlationId: string): Promise<AuditEvent[]> {
    return this.auditRepository.findByCorrelationId(correlationId);
  }

  public async findRecent(filters?: AuditFindFilters): Promise<AuditEvent[]> {
    return this.auditRepository.findRecent(filters);
  }
}
