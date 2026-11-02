import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
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

/**
 * Un movimiento manual de dinero exige el permiso del auxiliar afectado: transferencia →
 * bancos (treasury:manage); efectivo (o sin medio) → caja (cash:movements).
 */
export function requirePaymentMethodPermission(permissions: readonly string[], method: unknown): void {
  const normalized = typeof method === 'string' ? method.trim().toUpperCase() : 'EFECTIVO';
  if (normalized === 'TRANSFERENCIA') {
    if (!permissions.includes(SYSTEM_PERMISSIONS.TREASURY_MANAGE)) {
      throw new ForbiddenException('No tiene permiso para mover dinero en bancos.');
    }
  } else if (!permissions.includes(SYSTEM_PERMISSIONS.CASH_MOVEMENTS)) {
    throw new ForbiddenException('No tiene permiso para mover dinero en caja.');
  }
}
