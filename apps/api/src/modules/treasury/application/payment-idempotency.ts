import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@farmacia/database';
import { createHash } from 'crypto';
import { parseMoneyToCents, validateUuid } from '../domain/treasury-rules';

export function parsePaymentAmount(value: unknown, fieldName: string): bigint {
  try {
    return parseMoneyToCents(String(value), fieldName);
  } catch (error) {
    throw new BadRequestException((error as Error).message);
  }
}

export function requirePaymentBankAccountId(id: unknown): string {
  try {
    return validateUuid(id, 'ID de cuenta bancaria');
  } catch (error) {
    throw new BadRequestException((error as Error).message);
  }
}

export function paymentRequestHash(endpoint: string, userId: string, payload: unknown): string {
  return createHash('sha256').update(JSON.stringify({ endpoint, userId, payload })).digest('hex');
}

export async function findPaymentRetry<T>(
  tx: Prisma.TransactionClient,
  key: string | undefined,
  hash: string,
): Promise<T | null> {
  if (!key) return null;
  if (key.length > 100 || !key.trim()) {
    throw new BadRequestException('Idempotency-Key debe tener entre 1 y 100 caracteres.');
  }
  // Serialize requests sharing this key before reading the unique key table.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;
  const record = await tx.idempotencyKey.findUnique({ where: { key } });
  if (!record) return null;
  if (record.requestHash !== hash) {
    throw new ConflictException('Idempotency-Key ya se utilizó con una solicitud diferente.');
  }
  return record.responseBody as T;
}

export async function savePaymentRetry(
  tx: Prisma.TransactionClient,
  input: {
    key: string | undefined;
    endpoint: string;
    hash: string;
    userId: string;
    responseBody: object;
  },
): Promise<void> {
  if (!input.key) return;
  await tx.idempotencyKey.create({
    data: {
      key: input.key,
      endpoint: input.endpoint,
      requestHash: input.hash,
      userId: input.userId,
      responseStatus: 201,
      responseBody: input.responseBody as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}
