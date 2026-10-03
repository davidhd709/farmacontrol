import { ACCOUNTING_PURPOSES, type AccountingPurpose } from '@farmacia/contracts';
import { AccountingValidationError } from './accounting-rules';

export interface JournalLineInput {
  purpose?: AccountingPurpose;
  accountId?: string;
  debit: string;
  credit: string;
  description?: string;
}

export interface JournalPostInput {
  entryDate: string;
  description: string;
  sourceType: string;
  sourceId: string;
  createdById?: string;
  lines: JournalLineInput[];
}

export interface ValidatedJournalLine extends JournalLineInput {
  debit: string;
  credit: string;
}

export interface ValidatedJournalPost extends Omit<JournalPostInput, 'lines'> {
  entryDate: string;
  lines: ValidatedJournalLine[];
}

export function parseJournalDate(value: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new AccountingValidationError('Fecha contable inválida.');
  const date = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new AccountingValidationError('Fecha contable inválida.');
  return date;
}

export function normalizeJournalAmount(value: string): { value: string; cents: bigint } {
  if (typeof value !== 'string')
    throw new AccountingValidationError('El importe debe ser texto decimal.');
  const match = /^([0-9]{1,18})(?:\.([0-9]{1,2}))?$/.exec(value);
  if (!match) throw new AccountingValidationError('Importe inválido; máximo dos decimales.');
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return {
    value: `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`,
    cents,
  };
}

export function validateJournalPost(input: JournalPostInput): ValidatedJournalPost {
  if (!input || typeof input !== 'object') throw new AccountingValidationError('Asiento inválido.');
  parseJournalDate(input.entryDate);
  if (
    typeof input.description !== 'string' ||
    !input.description.trim() ||
    input.description.trim().length > 500
  )
    throw new AccountingValidationError('Descripción contable inválida.');
  if (
    typeof input.sourceType !== 'string' ||
    !/^[A-Z][A-Z0-9_]{0,63}$/.test(input.sourceType) ||
    input.sourceType === 'REVERSAL'
  )
    throw new AccountingValidationError('Origen contable inválido.');
  if (
    typeof input.sourceId !== 'string' ||
    !input.sourceId.trim() ||
    input.sourceId.trim().length > 128 ||
    input.sourceId !== input.sourceId.trim()
  )
    throw new AccountingValidationError('Identificador de origen inválido.');
  if (!Array.isArray(input.lines) || input.lines.length < 2)
    throw new AccountingValidationError('El asiento requiere al menos dos líneas.');
  let debitTotal = 0n;
  let creditTotal = 0n;
  const lines = input.lines.map((line) => {
    if (!line || typeof line !== 'object') {
      throw new AccountingValidationError('Línea contable inválida.');
    }
    if (!line.purpose && !line.accountId) {
      throw new AccountingValidationError('Cada línea debe especificar un propósito o una cuenta contable.');
    }
    if (line.purpose && !ACCOUNTING_PURPOSES.includes(line.purpose)) {
      throw new AccountingValidationError('Propósito contable inválido.');
    }
    if (
      line.description !== undefined &&
      (typeof line.description !== 'string' || line.description.trim().length > 500)
    )
      throw new AccountingValidationError('Descripción de línea inválida.');
    const debit = normalizeJournalAmount(line.debit);
    const credit = normalizeJournalAmount(line.credit);
    if (debit.cents > 0n === credit.cents > 0n)
      throw new AccountingValidationError('Cada línea debe tener un único lado positivo.');
    debitTotal += debit.cents;
    creditTotal += credit.cents;
    return {
      purpose: line.purpose,
      accountId: line.accountId,
      debit: debit.value,
      credit: credit.value,
      description: line.description?.trim() || undefined,
    };
  });
  if (debitTotal !== creditTotal || debitTotal <= 0n)
    throw new AccountingValidationError('El asiento debe estar balanceado y ser mayor que cero.');
  return {
    entryDate: input.entryDate,
    description: input.description.trim(),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    createdById: input.createdById,
    lines,
  };
}
