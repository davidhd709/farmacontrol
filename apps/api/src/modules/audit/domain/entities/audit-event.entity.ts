import { AuditEventDto } from '@farmacia/contracts';

export interface CreateAuditEventProps {
  id?: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  correlationId?: string | null;
  createdAt?: Date;
}

export interface ReconstituteAuditEventProps {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  correlationId: string | null;
  createdAt: Date;
}

export class AuditEvent {
  public readonly id: string;
  public readonly userId: string | null;
  public readonly action: string;
  public readonly entity: string;
  public readonly entityId: string | null;
  public readonly details: Record<string, unknown> | null;
  public readonly ipAddress: string | null;
  public readonly correlationId: string | null;
  public readonly createdAt: Date;

  private constructor(props: ReconstituteAuditEventProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.action = props.action;
    this.entity = props.entity;
    this.entityId = props.entityId;
    this.details = props.details ? Object.freeze({ ...props.details }) : null;
    this.ipAddress = props.ipAddress;
    this.correlationId = props.correlationId;
    this.createdAt = props.createdAt;
    Object.freeze(this);
  }

  public static create(props: CreateAuditEventProps): AuditEvent {
    const action = props.action ? props.action.trim() : '';
    if (!action) {
      throw new Error('La acción de auditoría no puede estar vacía.');
    }
    if (action.length > 100) {
      throw new Error('La acción de auditoría no puede exceder 100 caracteres.');
    }

    const entity = props.entity ? props.entity.trim() : '';
    if (!entity) {
      throw new Error('La entidad auditada no puede estar vacía.');
    }
    if (entity.length > 100) {
      throw new Error('El nombre de la entidad auditada no puede exceder 100 caracteres.');
    }

    const entityId = props.entityId != null ? String(props.entityId).trim() : null;
    if (entityId && entityId.length > 255) {
      throw new Error('El identificador de entidad no puede exceder 255 caracteres.');
    }

    const ipAddress = props.ipAddress != null ? String(props.ipAddress).trim() : null;
    if (ipAddress && ipAddress.length > 45) {
      throw new Error('La dirección IP no puede exceder 45 caracteres.');
    }

    const correlationId = props.correlationId != null ? String(props.correlationId).trim() : null;
    if (correlationId && correlationId.length > 100) {
      throw new Error('El correlationId no puede exceder 100 caracteres.');
    }

    const userId = props.userId != null ? String(props.userId).trim() : null;

    return new AuditEvent({
      id: props.id ?? crypto.randomUUID(),
      userId: userId || null,
      action,
      entity,
      entityId: entityId || null,
      details: props.details ?? null,
      ipAddress: ipAddress || null,
      correlationId: correlationId || null,
      createdAt: props.createdAt ?? new Date(),
    });
  }

  public static reconstitute(props: ReconstituteAuditEventProps): AuditEvent {
    return new AuditEvent(props);
  }

  public toDto(): AuditEventDto {
    return {
      id: this.id,
      userId: this.userId,
      action: this.action,
      entity: this.entity,
      entityId: this.entityId,
      details: this.details,
      ipAddress: this.ipAddress,
      correlationId: this.correlationId,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
