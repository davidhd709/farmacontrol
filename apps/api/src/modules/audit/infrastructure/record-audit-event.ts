import { Prisma } from '@farmacia/database';
import type { RecordAuditEventPayload } from '@farmacia/contracts';
import { AuditEvent } from '../domain/entities/audit-event.entity';

/** Persiste un evento ya validado por el dominio con el cliente recibido. */
export async function persistAuditEvent(
  db: Pick<Prisma.TransactionClient, 'auditEvent'>,
  event: AuditEvent,
): Promise<void> {
  await db.auditEvent.create({
    data: {
      id: event.id,
      userId: event.userId,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
      details: (event.details as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      ipAddress: event.ipAddress,
      correlationId: event.correlationId,
      createdAt: event.createdAt,
    },
  });
}

/**
 * Contrato transaccional del módulo de auditoría: los demás módulos registran sus eventos con
 * esta función, dentro de la transacción del caso de uso, en lugar de escribir `audit_events`
 * directamente. El evento pasa por las validaciones de `AuditEvent`.
 */
export async function recordAuditEvent(
  tx: Prisma.TransactionClient,
  input: RecordAuditEventPayload,
): Promise<void> {
  await persistAuditEvent(tx, AuditEvent.create(input));
}
