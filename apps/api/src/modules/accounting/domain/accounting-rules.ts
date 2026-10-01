import {
  ACCOUNT_TYPES,
  ACCOUNTING_PURPOSES,
  AccountType,
  AccountingPurpose,
} from '@farmacia/contracts';

const PURPOSE_ACCOUNT_TYPES: Record<AccountingPurpose, readonly AccountType[]> = {
  CASH: ['ASSET'],
  BANK: ['ASSET'],
  CUSTOMERS: ['ASSET'],
  SUPPLIERS: ['LIABILITY'],
  INVENTORY: ['ASSET'],
  SALES_TAXED: ['INCOME'],
  SALES_EXCLUDED: ['INCOME'],
  COST_OF_SALES: ['COST'],
  VAT_OUTPUT: ['LIABILITY'],
  VAT_INPUT: ['ASSET', 'LIABILITY'],
  VAT_INPUT_COMMON: ['ASSET', 'LIABILITY'],
  VAT_NON_DEDUCTIBLE: ['COST', 'EXPENSE'],
  SIMPLE_TAX_ADVANCE: ['ASSET'],
  SALES_RETURNS: ['INCOME'],
  SALES_DISCOUNTS: ['INCOME'],
  CAPITAL: ['EQUITY'],
  CURRENT_YEAR_RESULT: ['EQUITY'],
};

export function validatePurposeAccountType(
  purpose: AccountingPurpose,
  accountType: AccountType,
): void {
  if (!PURPOSE_ACCOUNT_TYPES[purpose].includes(accountType))
    throw new AccountingValidationError(`La cuenta no tiene un tipo compatible con ${purpose}.`);
}

export class AccountingValidationError extends Error {}
export class AccountingConflictError extends Error {}
export class AccountingNotFoundError extends Error {}

export function validateAccountFields(input: {
  code: unknown;
  name: unknown;
  type: unknown;
  allowsMovement: unknown;
  isActive?: unknown;
}): asserts input is {
  code: string;
  name: string;
  type: AccountType;
  allowsMovement: boolean;
  isActive?: boolean;
} {
  if (!input || typeof input !== 'object')
    throw new AccountingValidationError('Datos de cuenta inválidos.');
  if (typeof input.code !== 'string' || !/^[0-9A-Za-z.-]{1,32}$/.test(input.code.trim()))
    throw new AccountingValidationError('Código inválido.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 255)
    throw new AccountingValidationError('Nombre requerido (máximo 255 caracteres).');
  if (!ACCOUNT_TYPES.includes(input.type as AccountType))
    throw new AccountingValidationError('Tipo contable inválido.');
  if (typeof input.allowsMovement !== 'boolean')
    throw new AccountingValidationError('Permite movimiento debe ser booleano.');
  if (input.isActive !== undefined && typeof input.isActive !== 'boolean')
    throw new AccountingValidationError('Estado inválido.');
}

export function validatePurpose(value: string): AccountingPurpose {
  if (!ACCOUNTING_PURPOSES.includes(value as AccountingPurpose))
    throw new AccountingValidationError('Propósito contable inválido.');
  return value as AccountingPurpose;
}

export function validateParent(
  child: { id?: string; code: string; type: AccountType },
  parent: {
    id: string;
    code: string;
    type: AccountType;
    allowsMovement: boolean;
    isActive: boolean;
  } | null,
  requestedParentId: string | null,
): void {
  if (!requestedParentId) return;
  if (!parent) throw new AccountingNotFoundError('Cuenta padre inexistente.');
  if (child.id === parent.id)
    throw new AccountingValidationError('Una cuenta no puede ser su propia cuenta padre.');
  if (parent.type !== child.type)
    throw new AccountingValidationError('La cuenta padre debe tener el mismo tipo.');
  if (parent.allowsMovement)
    throw new AccountingValidationError('Una cuenta imputable no puede tener subcuentas.');
  if (!parent.isActive) throw new AccountingValidationError('La cuenta padre debe estar activa.');
  if (!child.code.startsWith(parent.code) || child.code === parent.code)
    throw new AccountingValidationError('El código no corresponde a la jerarquía de su padre.');
}
