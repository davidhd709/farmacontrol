import { Injectable, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { prisma, PrismaClient } from '@farmacia/database';
import { IdempotencyConflictException } from '../domain/sale.exceptions';

export interface IdempotencyRecord {
  responseStatus: number;
  responseBody: any;
}

@Injectable()
export class IdempotencyService {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  /**
   * El hash incluye endpoint y usuario: la misma clave reutilizada por otra persona u
   * operación es un conflicto, nunca una respuesta cacheada ajena.
   */
  public computeHash(endpoint: string, userId: string, payload: unknown): string {
    const serialized = JSON.stringify({ endpoint, userId, payload: payload ?? {} });
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  public async getRecord(
    key: string,
    expectedHash: string,
    tx?: any
  ): Promise<IdempotencyRecord | null> {
    const db = tx ?? this.client;
    const existing = await db.idempotencyKey.findUnique({
      where: { key },
    });

    if (!existing) return null;

    if (existing.requestHash !== expectedHash) {
      throw new IdempotencyConflictException(key);
    }

    return {
      responseStatus: existing.responseStatus,
      responseBody: existing.responseBody,
    };
  }

  public async saveRecord(
    params: {
      key: string;
      userId: string;
      endpoint: string;
      requestHash: string;
      responseStatus: number;
      responseBody: any;
      ttlHours?: number;
    },
    tx?: any
  ): Promise<void> {
    const db = tx ?? this.client;
    const ttlHours = params.ttlHours ?? 24;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await db.idempotencyKey.create({
      data: {
        key: params.key,
        userId: params.userId,
        endpoint: params.endpoint,
        requestHash: params.requestHash,
        responseStatus: params.responseStatus,
        responseBody: params.responseBody,
        expiresAt,
      },
    });
  }
}
