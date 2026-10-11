import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanTestDatabase, prisma } from '@farmacia/database';
import { IdempotencyCleanupService } from '../src/services/idempotency-cleanup.service';

describe('IdempotencyCleanupService (PostgreSQL real)', () => {
  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('borra sólo claves expiradas en lotes y admite ejecuciones solapadas', async () => {
    const user = await prisma.user.create({
      data: { username: 'cleanup-user', passwordHash: 'test', isActive: true },
    });
    const now = new Date();
    await prisma.idempotencyKey.createMany({
      data: Array.from({ length: 1001 }, (_, i) => ({
        key: `expired-${i}`,
        userId: user.id,
        endpoint: '/api/v1/test',
        requestHash: 'hash',
        responseStatus: 201,
        responseBody: { ok: true },
        createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      })),
    });
    await prisma.idempotencyKey.create({
      data: {
        key: 'active',
        userId: user.id,
        endpoint: '/api/v1/test',
        requestHash: 'hash',
        responseStatus: 201,
        responseBody: { ok: true },
        expiresAt: new Date(now.getTime() + 60_000),
      },
    });

    const [first, second] = await Promise.all([
      new IdempotencyCleanupService().deleteExpired(now),
      new IdempotencyCleanupService().deleteExpired(now),
    ]);
    expect(first + second).toBe(1001);
    expect(await prisma.idempotencyKey.findMany({ select: { key: true } })).toEqual([
      { key: 'active' },
    ]);
  });
});
