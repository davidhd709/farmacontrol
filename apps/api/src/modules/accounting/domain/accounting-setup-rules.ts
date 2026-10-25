import type { AccountingPurpose } from '@farmacia/contracts';

/**
 * Propósitos que exige el estado READY (ADR-006, F7). Los operativos y de patrimonio siempre;
 * el de diferencias de notas débito solo si la política lo usa; los tributarios solo con perfil
 * tributario vigente (F6), porque sin él el motor no los usa.
 */
export function requiredPurposes(input: {
  usesInventoryCostVariance: boolean;
  taxEngineActive: boolean;
}): {
  operating: AccountingPurpose[];
  equity: AccountingPurpose[];
  tax: AccountingPurpose[];
} {
  return {
    operating: [
      'CASH',
      'BANK',
      'CUSTOMERS',
      'SUPPLIERS',
      'INVENTORY',
      'SALES_TAXED',
      'SALES_EXCLUDED',
      'COST_OF_SALES',
      'SALES_RETURNS',
      'SALES_DISCOUNTS',
      ...(input.usesInventoryCostVariance ? (['INVENTORY_COST_VARIANCE'] as const) : []),
    ],
    equity: ['CAPITAL', 'CURRENT_YEAR_RESULT', 'RETAINED_EARNINGS', 'ACCUMULATED_LOSSES'],
    tax: input.taxEngineActive
      ? [
          'VAT_OUTPUT',
          'VAT_INPUT',
          'SALES_EXEMPT',
          'INC_PAYABLE',
          'WITHHOLDING_INCOME_PAYABLE',
          'WITHHOLDING_VAT_PAYABLE',
          'WITHHOLDING_ICA_PAYABLE',
        ]
      : [],
  };
}

/** Código del padre en la jerarquía del PUC: clase (1), grupo (2), cuenta (4), subcuenta (6+). */
export function pucParentCode(code: string): string | null {
  if (code.length <= 1) return null;
  if (code.length === 2) return code.slice(0, 1);
  if (code.length <= 4) return code.slice(0, 2);
  if (code.length <= 6) return code.slice(0, 4);
  return code.slice(0, code.length - 2);
}
