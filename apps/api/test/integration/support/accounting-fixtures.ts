import { prisma } from '@farmacia/database';
import { ACCOUNTING_PURPOSES, type AccountingPurpose } from '@farmacia/contracts';

/** Tipo de cuenta compatible con cada propósito, para mapear en pruebas. */
const TYPE_BY_PURPOSE: Record<
  AccountingPurpose,
  'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'COST'
> = {
  CASH: 'ASSET',
  BANK: 'ASSET',
  CUSTOMERS: 'ASSET',
  SUPPLIERS: 'LIABILITY',
  INVENTORY: 'ASSET',
  SALES_TAXED: 'INCOME',
  SALES_EXCLUDED: 'INCOME',
  COST_OF_SALES: 'COST',
  VAT_OUTPUT: 'LIABILITY',
  VAT_INPUT: 'ASSET',
  VAT_INPUT_COMMON: 'ASSET',
  VAT_NON_DEDUCTIBLE: 'EXPENSE',
  SIMPLE_TAX_ADVANCE: 'ASSET',
  SALES_RETURNS: 'INCOME',
  SALES_DISCOUNTS: 'INCOME',
  CAPITAL: 'EQUITY',
  CURRENT_YEAR_RESULT: 'EQUITY',
  RETAINED_EARNINGS: 'EQUITY',
  ACCUMULATED_LOSSES: 'EQUITY',
  INVENTORY_COST_VARIANCE: 'COST',
  SALES_EXEMPT: 'INCOME',
  INC_PAYABLE: 'LIABILITY',
  WITHHOLDING_INCOME_PAYABLE: 'LIABILITY',
  WITHHOLDING_VAT_PAYABLE: 'LIABILITY',
  WITHHOLDING_ICA_PAYABLE: 'LIABILITY',
  INVENTORY_SHRINKAGE: 'EXPENSE',
  INVENTORY_SURPLUS: 'INCOME',
};

/**
 * Crea una cuenta imputable por propósito que aún no esté mapeado y la mapea desde 2020.
 * Las pruebas que mueven inventario, caja o bancos la usan porque la contabilidad es estricta.
 */
export async function seedPurposeMappings(
  purposes: readonly AccountingPurpose[] = ACCOUNTING_PURPOSES,
) {
  const accounts: Partial<Record<AccountingPurpose, string>> = {};
  for (const [index, purpose] of purposes.entries()) {
    const existing = await prisma.companyAccountingMapping.findFirst({
      where: { purpose, status: 'ACTIVE', accountId: { not: null } },
    });
    if (existing) {
      accounts[purpose] = existing.accountId!;
      continue;
    }
    const account = await prisma.account.create({
      data: {
        code: `99${String(index).padStart(4, '0')}`,
        name: `Prueba ${purpose}`,
        type: TYPE_BY_PURPOSE[purpose],
        level: 1,
        allowsMovement: true,
      },
    });
    await prisma.companyAccountingMapping.create({
      data: {
        purpose,
        accountId: account.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2020-01-01T00:00:00Z'),
      },
    });
    accounts[purpose] = account.id;
  }
  return accounts as Record<AccountingPurpose, string>;
}
