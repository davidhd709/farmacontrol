import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@farmacia/database';
import { createHash } from 'crypto';
import { IdempotencyConflictException } from './idempotency.errors';

export interface IdempotencyRecord {
  responseStatus: number;
  responseBody: unknown;
}

@Injectable()
export class IdempotencyService {
  async retryOnSerialization<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const retryable =
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            (error.code === 'P2034' ||
              error.code === 'P2028' ||
              (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))))) ||
          (error instanceof Error &&
            /40001|40P01|could not serialize access|deadlock detected/i.test(error.message));
        if (!retryable || attempt >= 9) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
  }

  /** El hash incluye endpoint y usuario: la clave queda ligada a una operación y a una persona. */
  computeHash(endpoint: string, userId: string, payload: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify({ endpoint, userId, payload: payload ?? {} }))
      .digest('hex');
  }

  /** Debe ejecutarse dentro de la transacción del caso de uso, antes de cualquier escritura. */
  async getRecord(
    key: string,
    expectedHash: string,
    tx: Prisma.TransactionClient,
    conflict: 'domain' | 'http' = 'domain',
  ): Promise<IdempotencyRecord | null> {
    if (!key.trim() || key.length > 100) {
      throw new BadRequestException('Idempotency-Key debe tener entre 1 y 100 caracteres.');
    }
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
    const existing = await tx.idempotencyKey.findUnique({ where: { key } });
    if (!existing) return null;
    if (existing.expiresAt <= new Date()) {
      await tx.idempotencyKey.deleteMany({ where: { key, expiresAt: { lte: new Date() } } });
      return null;
    }
    if (existing.requestHash !== expectedHash) {
      if (conflict === 'http') {
        throw new ConflictException('Idempotency-Key ya se utilizó con una solicitud diferente.');
      }
      throw new IdempotencyConflictException(key);
    }
    return { responseStatus: existing.responseStatus, responseBody: existing.responseBody };
  }

  async saveRecord(
    params: {
      key: string;
      userId: string;
      endpoint: string;
      requestHash: string;
      responseStatus: number;
      responseBody: unknown;
      ttlHours?: number;
    },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.idempotencyKey.create({
      data: {
        key: params.key,
        userId: params.userId,
        endpoint: params.endpoint,
        requestHash: params.requestHash,
        responseStatus: params.responseStatus,
        responseBody: params.responseBody as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + (params.ttlHours ?? 24) * 60 * 60 * 1000),
      },
    });
  }
}
