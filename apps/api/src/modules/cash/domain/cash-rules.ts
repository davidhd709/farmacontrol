import type { CashMovementType } from '@farmacia/contracts';
import {
  InsufficientCashBalanceException,
  InvalidCashAmountException,
  InvalidCashMovementTypeException,
} from './cash.exceptions';

const MAX_CENTS = 99999999999999n; // Hasta 12 dígitos enteros y 2 decimales
const MONEY_RE = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export function parseMoneyToCents(value: unknown, name = 'El monto'): bigint {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new InvalidCashAmountException();
    }
    return parseMoneyToCents(value.toFixed(2), name);
  }

  if (typeof value !== 'string' || !MONEY_RE.test(value)) {
    throw new InvalidCashAmountException();
  }

  const parts = value.split('.');
  const intPart = BigInt(parts[0]);
  const decPart = BigInt((parts[1] ?? '').padEnd(2, '0'));
  const cents = intPart * 100n + decPart;

  if (cents > MAX_CENTS) {
    throw new InvalidCashAmountException();
  }
  return cents;
}

export function centsToMoneyString(cents: bigint): string {
  const isNegative = cents < 0n;
  const abs = isNegative ? -cents : cents;
  const intPart = abs / 100n;
  const decPart = (abs % 100n).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${intPart}.${decPart}`;
}

export function isCashIncome(movementType: CashMovementType): boolean {
  return movementType === 'INGRESO_VENTA' || movementType === 'INGRESO_MANUAL';
}

export function isCashExpense(movementType: CashMovementType): boolean {
  return movementType === 'EGRESO_MANUAL' || movementType === 'EGRESO_PAGO_PROVEEDOR';
}

export function validateCashMovementType(type: unknown): CashMovementType {
  const validTypes: CashMovementType[] = [
    'INGRESO_VENTA',
    'INGRESO_MANUAL',
    'EGRESO_MANUAL',
    'EGRESO_PAGO_PROVEEDOR',
  ];
  if (typeof type !== 'string' || !validTypes.includes(type as CashMovementType)) {
    throw new InvalidCashMovementTypeException();
  }
  return type as CashMovementType;
}

export function calculateNewCashBalanceCents(
  currentBalanceCents: bigint,
  movementType: CashMovementType,
  amountCents: bigint,
): { balanceBefore: bigint; balanceAfter: bigint } {
  if (amountCents <= 0n) {
    throw new InvalidCashAmountException();
  }

  const isIncome = isCashIncome(movementType);
  const isExpense = isCashExpense(movementType);

  if (!isIncome && !isExpense) {
    throw new InvalidCashMovementTypeException();
  }

  const delta = isIncome ? amountCents : -amountCents;
  const balanceAfter = currentBalanceCents + delta;

  if (balanceAfter < 0n) {
    const currentNumber = Number(centsToMoneyString(currentBalanceCents));
    const amountNumber = Number(centsToMoneyString(amountCents));
    throw new InsufficientCashBalanceException(currentNumber, amountNumber);
  }

  return {
    balanceBefore: currentBalanceCents,
    balanceAfter,
  };
}
