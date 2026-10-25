import { describe, expect, it } from 'vitest';
import { ACCOUNTING_PURPOSES } from '@farmacia/contracts';
import { PHARMACY_PUC_TEMPLATE } from '../../src/modules/accounting/domain/puc-templates/pharmacy';
import {
  pucParentCode,
  requiredPurposes,
} from '../../src/modules/accounting/domain/accounting-setup-rules';
import { validatePurposeAccountType } from '../../src/modules/accounting/domain/accounting-rules';

describe('plantilla PUC del perfil farmacia (F7)', () => {
  const accounts = PHARMACY_PUC_TEMPLATE.accounts;
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  it('cubre todos los propósitos contables una sola vez', () => {
    const purposes = accounts.filter((a) => a.purpose).map((a) => a.purpose);
    expect(new Set(purposes).size).toBe(purposes.length);
    expect([...purposes].sort()).toEqual([...ACCOUNTING_PURPOSES].sort());
  });

  it('cada cuenta tiene su padre antes que ella, del mismo tipo y agrupador', () => {
    accounts.forEach((account, index) => {
      const parentCode = pucParentCode(account.code);
      if (!parentCode) return;
      const parent = byCode.get(parentCode);
      expect(parent, `padre de ${account.code}`).toBeDefined();
      expect(accounts.indexOf(parent!)).toBeLessThan(index);
      expect(parent!.type).toBe(account.type);
      expect(parent!.allowsMovement).toBe(false);
    });
  });

  it('solo las subcuentas son imputables y su tipo admite el propósito mapeado', () => {
    for (const account of accounts) {
      expect(account.allowsMovement).toBe(account.code.length >= 6);
      if (account.purpose)
        expect(() => validatePurposeAccountType(account.purpose!, account.type)).not.toThrow();
    }
  });

  it('exige los propósitos tributarios solo con el motor tributario activo', () => {
    expect(
      requiredPurposes({ usesInventoryCostVariance: false, taxEngineActive: false }).tax,
    ).toEqual([]);
    const withTaxes = requiredPurposes({ usesInventoryCostVariance: true, taxEngineActive: true });
    expect(withTaxes.tax).toContain('WITHHOLDING_INCOME_PAYABLE');
    expect(withTaxes.operating).toContain('INVENTORY_COST_VARIANCE');
  });
});
