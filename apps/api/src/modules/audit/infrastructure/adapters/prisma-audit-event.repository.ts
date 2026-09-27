import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import {
  AuditEventRepositoryPort,
  AuditFindFilters,
} from '../../application/ports/audit-event.repository.port';
import { AuditEvent } from '../../domain/entities/audit-event.entity';

@Injectable()
export class PrismaAuditEventRepository implements AuditEventRepositoryPort {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  public async save(event: AuditEvent, tx?: unknown): Promise<void> {
    const db = (tx as Prisma.TransactionClient) ?? this.client;

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

  public async findById(id: string): Promise<AuditEvent | null> {
    const record = await this.client.auditEvent.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async findByCorrelationId(correlationId: string): Promise<AuditEvent[]> {
    const records = await this.client.auditEvent.findMany({
      where: { correlationId },
      orderBy: { createdAt: 'asc' },
    });

    return records.map((r) => this.toDomain(r));
  }

  public async findRecent(filters?: AuditFindFilters): Promise<AuditEvent[]> {
    const where: Prisma.AuditEventWhereInput = {};

    if (filters?.userId) {
      where.userId = filters.userId;
    }
    if (filters?.action) {
      where.action = filters.action;
    }
    if (filters?.entity) {
      where.entity = filters.entity;
    }
    if (filters?.entityId) {
      where.entityId = filters.entityId;
    }
    if (filters?.correlationId) {
      where.correlationId = filters.correlationId;
    }
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) {
        where.createdAt.gte = filters.from;
      }
      if (filters.to) {
        where.createdAt.lte = filters.to;
      }
    }

    const records = await this.client.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit ?? 50,
    });

    return records.map((r) => this.toDomain(r));
  }

  private toDomain(record: {
    id: string;
    userId: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    details: Prisma.JsonValue;
    ipAddress: string | null;
    correlationId: string | null;
    createdAt: Date;
  }): AuditEvent {
    let parsedDetails: Record<string, unknown> | null = null;
    if (record.details && typeof record.details === 'object' && !Array.isArray(record.details)) {
      parsedDetails = record.details as Record<string, unknown>;
    }

    return AuditEvent.reconstitute({
      id: record.id,
      userId: record.userId,
      action: record.action,
      entity: record.entity,
      entityId: record.entityId,
      details: parsedDetails,
      ipAddress: record.ipAddress,
      correlationId: record.correlationId,
      createdAt: record.createdAt,
    });
  }
}
