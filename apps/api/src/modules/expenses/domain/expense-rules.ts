import { BadRequestException } from '@nestjs/common';
import { ExpensePaymentMethod, ExpenseStatus } from '@farmacia/contracts';
import { parseMoneyToCents, centsToMoneyString, validateUuid } from '../../treasury/domain/treasury-rules';

export function validateExpenseAmount(amount: string | number | undefined | null): bigint {
  if (amount === undefined || amount === null || amount === '') {
    throw new BadRequestException('El monto del gasto es obligatorio.');
  }
  const cents = parseMoneyToCents(amount.toString(), 'Monto del gasto');
  if (cents <= 0n) {
    throw new BadRequestException('El monto del gasto debe ser mayor a cero.');
  }
  return cents;
}

export function validateExpensePaymentMethod(method: string): ExpensePaymentMethod {
  const normalized = method?.trim().toUpperCase();
  if (normalized !== 'EFECTIVO' && normalized !== 'TRANSFERENCIA' && normalized !== 'CREDITO') {
    throw new BadRequestException(
      `Método de pago inválido "${method}". Valores permitidos: EFECTIVO, TRANSFERENCIA, CREDITO.`,
    );
  }
  return normalized as ExpensePaymentMethod;
}

export function validateExpenseStatusTransition(
  currentStatus: string,
  newStatus: ExpenseStatus,
): void {
  if (currentStatus === 'ANULADO') {
    throw new BadRequestException('No se pueden modificar ni realizar operaciones sobre un gasto anulado.');
  }
  if (currentStatus === 'PAGADO' && newStatus === 'PENDIENTE') {
    // Solo permitido mediante reversión formal de pago
    return;
  }
}

export function validateReversalReason(reason: string | undefined | null): string {
  const trimmed = reason?.trim();
  if (!trimmed || trimmed.length < 5) {
    throw new BadRequestException(
      'El motivo de anulación o reversión es obligatorio y debe tener al menos 5 caracteres.',
    );
  }
  return trimmed;
}

export { parseMoneyToCents, centsToMoneyString, validateUuid };
