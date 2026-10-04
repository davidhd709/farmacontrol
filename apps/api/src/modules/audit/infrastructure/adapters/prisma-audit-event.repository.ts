import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import {
  AuditEventRepositoryPort,
  AuditFindFilters,
} from '../../application/ports/audit-event.repository.port';
import { AuditEvent } from '../../domain/entities/audit-event.entity';
import {
  AuditEventDto,
  AuditMetadataDto,
  AuditQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';

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

  public async findByIdWithUser(id: string): Promise<AuditEventDto | null> {
    const r = await this.client.auditEvent.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    });

    if (!r) return null;

    let parsedDetails: Record<string, unknown> | null = null;
    if (r.details && typeof r.details === 'object' && !Array.isArray(r.details)) {
      parsedDetails = r.details as Record<string, unknown>;
    }

    return {
      id: r.id,
      userId: r.userId,
      user: r.user ? { id: r.user.id, username: r.user.username } : null,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      details: parsedDetails,
      ipAddress: r.ipAddress,
      correlationId: r.correlationId,
      createdAt: r.createdAt.toISOString(),
    };
  }

  public async findPaginated(filters: AuditQueryFilters): Promise<PaginatedResponse<AuditEventDto>> {
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.AuditEventWhereInput = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.entity) {
      where.entity = filters.entity;
    }
    if (filters.entityId) {
      where.entityId = filters.entityId;
    }
    if (filters.correlationId) {
      where.correlationId = filters.correlationId;
    }
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) {
        where.createdAt.gte = new Date(`${filters.fromDate}T00:00:00.000Z`);
      }
      if (filters.toDate) {
        where.createdAt.lte = new Date(`${filters.toDate}T23:59:59.999Z`);
      }
    }
    if (filters.search && filters.search.trim()) {
      const s = filters.search.trim();
      where.OR = [
        { action: { contains: s, mode: 'insensitive' } },
        { entity: { contains: s, mode: 'insensitive' } },
        { entityId: { contains: s, mode: 'insensitive' } },
        { correlationId: { contains: s, mode: 'insensitive' } },
        { user: { username: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [total, records] = await Promise.all([
      this.client.auditEvent.count({ where }),
      this.client.auditEvent.findMany({
        where,
        include: {
          user: {
            select: { id: true, username: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const items: AuditEventDto[] = records.map((r) => {
      let parsedDetails: Record<string, unknown> | null = null;
      if (r.details && typeof r.details === 'object' && !Array.isArray(r.details)) {
        parsedDetails = r.details as Record<string, unknown>;
      }
      return {
        id: r.id,
        userId: r.userId,
        user: r.user ? { id: r.user.id, username: r.user.username } : null,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        details: parsedDetails,
        ipAddress: r.ipAddress,
        correlationId: r.correlationId,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  public async getDistinctMetadata(): Promise<AuditMetadataDto> {
    const [entitiesRaw, actionsRaw] = await Promise.all([
      this.client.auditEvent.findMany({
        select: { entity: true },
        distinct: ['entity'],
        orderBy: { entity: 'asc' },
      }),
      this.client.auditEvent.findMany({
        select: { action: true },
        distinct: ['action'],
        orderBy: { action: 'asc' },
      }),
    ]);

    return {
      entities: entitiesRaw.map((e) => e.entity).filter(Boolean),
      actions: actionsRaw.map((a) => a.action).filter(Boolean),
    };
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
