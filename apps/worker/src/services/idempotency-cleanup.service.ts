import { Injectable } from '@nestjs/common';
import { prisma, PrismaClient } from '@farmacia/database';

@Injectable()
export class IdempotencyCleanupService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async deleteExpired(now = new Date()): Promise<number> {
    let total = 0;
    while (true) {
      const deleted = await this.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM idempotency_keys
          WHERE expires_at <= ${now}
          ORDER BY expires_at, id
          LIMIT 1000 FOR UPDATE SKIP LOCKED
        `;
        if (rows.length === 0) return 0;
        const result = await tx.idempotencyKey.deleteMany({
          where: { id: { in: rows.map((row) => row.id) }, expiresAt: { lte: now } },
        });
        return result.count;
      });
      total += deleted;
      if (deleted < 1000) return total;
    }
  }
}
