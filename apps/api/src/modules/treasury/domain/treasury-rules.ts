import type { BankAccountType, BankMovementType } from '@farmacia/contracts';

export class TreasuryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TreasuryValidationError';
  }
}

export class TreasuryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TreasuryNotFoundError';
  }
}

export class TreasuryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TreasuryConflictError';
  }
}

const MAX_CENTS = 99999999999999n; // Hasta 12 dígitos enteros y 2 decimales
const MONEY_RE = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMoneyToCents(value: unknown, name: string): bigint {
  if (typeof value !== 'string' || !MONEY_RE.test(value)) {
    throw new TreasuryValidationError(`${name} debe ser un valor monetario decimal válido (máx 2 decimales).`);
  }
  const parts = value.split('.');
  const intPart = BigInt(parts[0]);
  const decPart = BigInt((parts[1] ?? '').padEnd(2, '0'));
  const cents = intPart * 100n + decPart;
  if (cents > MAX_CENTS) {
    throw new TreasuryValidationError(`${name} excede el valor monetario máximo permitido.`);
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

export function isOutflow(type: BankMovementType): boolean {
  return type === 'WITHDRAWAL' || type === 'TRANSFER_OUT' || type === 'FEE';
}

export function calculateNewBalanceCents(
  currentBalanceCents: bigint,
  movementType: BankMovementType,
  amountCents: bigint,
  allowOverdraft = false,
): { balanceBefore: bigint; balanceAfter: bigint } {
  if (amountCents <= 0n) {
    throw new TreasuryValidationError('El importe del movimiento debe ser estrictamente positivo.');
  }

  const isDebit = isOutflow(movementType);
  const delta = isDebit ? -amountCents : amountCents;
  const balanceAfter = currentBalanceCents + delta;

  if (!allowOverdraft && balanceAfter < 0n) {
    throw new TreasuryValidationError('Fondos insuficientes: el movimiento excede el saldo disponible en la cuenta bancaria.');
  }

  return {
    balanceBefore: currentBalanceCents,
    balanceAfter,
  };
}

export function validateBankName(bankName: unknown): string {
  if (typeof bankName !== 'string' || !bankName.trim() || bankName.trim().length > 100) {
    throw new TreasuryValidationError('El nombre del banco o entidad es obligatorio (máx 100 caracteres).');
  }
  return bankName.trim();
}

export function validateAccountType(accountType: unknown): BankAccountType {
  if (typeof accountType !== 'string' || !['AHORROS', 'CORRIENTE', 'DIGITAL'].includes(accountType)) {
    throw new TreasuryValidationError('Tipo de cuenta inválido. Tipos permitidos: AHORROS, CORRIENTE, DIGITAL.');
  }
  return accountType as BankAccountType;
}

export function validateAccountNumber(accountNumber: unknown): string {
  if (typeof accountNumber !== 'string' || !accountNumber.trim() || accountNumber.trim().length > 50) {
    throw new TreasuryValidationError('El número de cuenta es obligatorio (máx 50 caracteres).');
  }
  return accountNumber.trim();
}

export function validateAccountName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 150) {
    throw new TreasuryValidationError('El nombre descriptivo de la cuenta es obligatorio (máx 150 caracteres).');
  }
  return name.trim();
}

export function validateConcept(concept: unknown): string {
  if (typeof concept !== 'string' || !concept.trim() || concept.trim().length > 255) {
    throw new TreasuryValidationError('El concepto del movimiento es obligatorio (máx 255 caracteres).');
  }
  return concept.trim();
}

export function validateUuid(id: unknown, fieldName: string): string {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw new TreasuryValidationError(`${fieldName} debe ser un UUID válido.`);
  }
  return id;
}
