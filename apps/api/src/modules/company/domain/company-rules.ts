import { DomainError } from '../../../common/domain-error';
import {
  AVAILABLE_COSTING_METHODS,
  BONUS_UNITS_TREATMENTS,
  COSTING_METHODS,
  OPENING_COST_SOURCES,
  PURCHASE_RETURN_VARIANCE_PURPOSES,
  SECTOR_PROFILES,
  type BonusUnitsTreatment,
  type CostingMethod,
  type OpeningCostSource,
  type PurchaseReturnVariancePurpose,
} from '@farmacia/contracts';

export class CompanyValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'validation');
  }
}

export class CompanyConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'conflict');
  }
}

export class CompanyNotConfiguredError extends DomainError {
  constructor() {
    super('La empresa aún no está configurada.', 'not_found');
  }
}

/** Pesos de la DIAN para el dígito de verificación, desde el dígito menos significativo. */
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación de un NIT según el algoritmo de módulo 11 de la DIAN. */
export function nitCheckDigit(taxId: string): string {
  if (!/^[0-9]{5,15}$/.test(taxId)) {
    throw new CompanyValidationError(
      'El NIT debe tener entre 5 y 15 dígitos, sin puntos ni guion.',
    );
  }
  const digits = taxId.split('').reverse();
  const sum = digits.reduce((total, digit, i) => total + Number(digit) * NIT_WEIGHTS[i], 0);
  const remainder = sum % 11;
  return String(remainder > 1 ? 11 - remainder : remainder);
}

export function assertValidNit(taxId: string, checkDigit: string): void {
  const expected = nitCheckDigit(taxId);
  if (checkDigit !== expected) {
    throw new CompanyValidationError(
      `El dígito de verificación ${checkDigit} no corresponde al NIT ${taxId}; debería ser ${expected}.`,
    );
  }
}

export function assertSectorProfile(
  value: unknown,
): asserts value is (typeof SECTOR_PROFILES)[number] {
  if (!(SECTOR_PROFILES as readonly unknown[]).includes(value)) {
    throw new CompanyValidationError(
      `Perfil sectorial no disponible. Opciones: ${SECTOR_PROFILES.join(', ')}.`,
    );
  }
}

export function assertMunicipalityCode(value: string | null | undefined): void {
  if (value !== null && value !== undefined && !/^[0-9]{5}$/.test(value)) {
    throw new CompanyValidationError('El código DANE del municipio debe tener 5 dígitos.');
  }
}

export interface AccountingPolicyValues {
  costingMethod: CostingMethod;
  openingCostSource: OpeningCostSource;
  purchaseReturnVariancePurpose: PurchaseReturnVariancePurpose;
  bonusUnitsTreatment: BonusUnitsTreatment;
}

/**
 * Valores por defecto (ADR-005 y ADR-006). Rigen mientras la empresa no registre su propia
 * política, de modo que una instalación sin configurar se comporta como antes de F3.
 */
export const DEFAULT_ACCOUNTING_POLICY: AccountingPolicyValues = {
  costingMethod: 'WEIGHTED_AVERAGE',
  openingCostSource: 'LAST_PURCHASE_THEN_CATALOG',
  purchaseReturnVariancePurpose: 'COST_OF_SALES',
  bonusUnitsTreatment: 'ZERO_COST_IN_AVERAGE',
};

function assertOneOf<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (!(options as readonly unknown[]).includes(value)) {
    throw new CompanyValidationError(`${label} no válido. Opciones: ${options.join(', ')}.`);
  }
  return value as T;
}

export function validatePolicyValues(input: Record<string, unknown>): AccountingPolicyValues {
  const costingMethod = assertOneOf(input.costingMethod, COSTING_METHODS, 'Método de costeo');
  if (!AVAILABLE_COSTING_METHODS.includes(costingMethod)) {
    throw new CompanyValidationError(
      `El método de costeo ${costingMethod} todavía no está disponible; por ahora solo ${AVAILABLE_COSTING_METHODS.join(', ')}.`,
    );
  }
  return {
    costingMethod,
    openingCostSource: assertOneOf(
      input.openingCostSource,
      OPENING_COST_SOURCES,
      'Costo de apertura',
    ),
    purchaseReturnVariancePurpose: assertOneOf(
      input.purchaseReturnVariancePurpose,
      PURCHASE_RETURN_VARIANCE_PURPOSES,
      'Propósito de la diferencia en notas débito',
    ),
    bonusUnitsTreatment: assertOneOf(
      input.bonusUnitsTreatment,
      BONUS_UNITS_TREATMENTS,
      'Tratamiento de bonificaciones',
    ),
  };
}

/**
 * Un cambio de método de costeo rige desde el primer día de un mes posterior al actual
 * (ADR-006, F5): el período en curso cierra completo con el método anterior.
 */
export function assertCostingMethodChangeDate(effectiveFrom: string, today: string): void {
  if (!effectiveFrom.endsWith('-01') || effectiveFrom.slice(0, 7) <= today.slice(0, 7)) {
    throw new CompanyValidationError(
      'Un cambio de método de costeo debe regir desde el primer día de un mes futuro: el período en curso cierra con el método anterior.',
    );
  }
}
