import { describe, expect, it } from 'vitest';
import {
  companySetupSchema,
  nitCheckDigit,
  policySchema,
} from '../src/features/company/validation/company.schema';

const valid = {
  legalName: 'Droguería La Esperanza S.A.S.',
  tradeName: '',
  taxId: '900123456',
  taxIdCheckDigit: '8',
  municipalityCode: '05001',
  address: '',
  email: '',
  phone: '',
  branchCode: 'PRINCIPAL',
  branchName: 'Sede principal',
};

describe('Formulario de la empresa', () => {
  it('calcula el dígito de verificación como la DIAN', () => {
    expect(nitCheckDigit('800197268')).toBe('4');
    expect(nitCheckDigit('900.123')).toBeNull();
  });

  it('avisa antes de enviar si el dígito no corresponde al NIT', () => {
    expect(companySetupSchema.safeParse(valid).success).toBe(true);
    const wrong = companySetupSchema.safeParse({ ...valid, taxIdCheckDigit: '3' });
    expect(wrong.success).toBe(false);
    expect(wrong.error?.issues[0]).toMatchObject({
      path: ['taxIdCheckDigit'],
      message: 'No corresponde al NIT; debería ser 8',
    });
  });

  it('valida el código DANE y el correo cuando se informan', () => {
    expect(companySetupSchema.safeParse({ ...valid, municipalityCode: '5001' }).success).toBe(
      false,
    );
    expect(companySetupSchema.safeParse({ ...valid, email: 'no-es-correo' }).success).toBe(false);
  });

  it('exige el motivo de cada versión de la política', () => {
    const policy = {
      effectiveFrom: '2026-11-01',
      costingMethod: 'WEIGHTED_AVERAGE',
      openingCostSource: 'CATALOG',
      purchaseReturnVariancePurpose: 'COST_OF_SALES',
      bonusUnitsTreatment: 'ZERO_COST_IN_AVERAGE',
      reason: '  ',
    };
    expect(policySchema.safeParse(policy).success).toBe(false);
    expect(policySchema.safeParse({ ...policy, reason: 'Política inicial' }).success).toBe(true);
  });
});
