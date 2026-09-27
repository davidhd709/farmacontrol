import { AuditEvent } from '../../domain/entities/audit-event.entity';

export const AUDIT_EVENT_REPOSITORY_PORT = Symbol('AUDIT_EVENT_REPOSITORY_PORT');

export interface AuditFindFilters {
  userId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  correlationId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface AuditEventRepositoryPort {
  /**
   * Persiste un evento de auditoría.
   * Soporta ejecución dentro de una transacción interactiva (tx) para garantizar
   * atomicidad entre la mutación de negocio y el registro de auditoría.
   */
  save(event: AuditEvent, tx?: unknown): Promise<void>;

  /**
   * Busca un evento de auditoría por su identificador único.
   */
  findById(id: string): Promise<AuditEvent | null>;

  /**
   * Busca eventos asociados a un correlationId específico.
   */
  findByCorrelationId(correlationId: string): Promise<AuditEvent[]>;

  /**
   * Lista los eventos de auditoría más recientes con filtros opcionales.
   */
  findRecent(filters?: AuditFindFilters): Promise<AuditEvent[]>;
}
