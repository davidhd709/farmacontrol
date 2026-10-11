import { BadRequestException } from '@nestjs/common';
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
