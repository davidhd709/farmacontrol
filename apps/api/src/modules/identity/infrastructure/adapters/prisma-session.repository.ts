import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient } from '@farmacia/database';
import { SessionRepositoryPort } from '../../application/ports/session.repository.port';
import { Session } from '../../domain/entities/session.entity';

@Injectable()
export class PrismaSessionRepository implements SessionRepositoryPort {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  public async create(session: Session): Promise<Session> {
    const record = await this.client.session.create({
      data: {
        ...(session.id ? { id: session.id } : {}),
        userId: session.userId,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
        ...(session.createdAt ? { createdAt: session.createdAt } : {}),
        lastUsedAt: session.lastUsedAt ?? null,
        revokedAt: session.revokedAt ?? null,
      },
    });

    return this.toDomain(record);
  }

  public async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const record = await this.client.session.findUnique({
      where: { tokenHash: tokenHash.trim().toLowerCase() },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async findById(id: string): Promise<Session | null> {
    const record = await this.client.session.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toDomain(record);
  }

  public async update(session: Session): Promise<Session> {
    if (!session.id) {
      throw new Error('No se puede actualizar una sesión sin identificador primario id.');
    }

    const record = await this.client.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: session.lastUsedAt ?? null,
        revokedAt: session.revokedAt ?? null,
      },
    });

    return this.toDomain(record);
  }

  public async delete(id: string): Promise<void> {
    await this.client.session.delete({
      where: { id },
    });
  }

  public async deleteByUserId(userId: string): Promise<number> {
    const result = await this.client.session.deleteMany({
      where: { userId },
    });

    return result.count;
  }

  private toDomain(record: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
  }): Session {
    return Session.reconstitute({
      id: record.id,
      userId: record.userId,
      tokenHash: record.tokenHash,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      revokedAt: record.revokedAt,
    });
  }
}
