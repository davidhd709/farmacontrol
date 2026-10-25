import { Prisma, type PrismaClient } from '@farmacia/database';
import { DEFAULT_ACCOUNTING_POLICY, type AccountingPolicyValues } from '../domain/company-rules';

type Client = Prisma.TransactionClient | PrismaClient;

export interface EffectiveAccountingPolicy extends AccountingPolicyValues {
  id: string | null;
}

/**
 * Política contable vigente en un día calendario (YYYY-MM-DD). Es el contrato de lectura
 * para otros módulos: inventario y compras la consultan dentro de su propia transacción.
 * Sin empresa o sin versiones registradas rigen los valores por defecto (ADR-005).
 */
export async function accountingPolicyAt(
  client: Client,
  day: string,
): Promise<EffectiveAccountingPolicy> {
  const company = await client.company.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  if (!company) return { id: null, ...DEFAULT_ACCOUNTING_POLICY };
  const policy = await client.companyAccountingPolicy.findFirst({
    where: { companyId: company.id, effectiveFrom: { lte: new Date(`${day}T00:00:00.000Z`) } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!policy) return { id: null, ...DEFAULT_ACCOUNTING_POLICY };
  return {
    id: policy.id,
    costingMethod: policy.costingMethod as AccountingPolicyValues['costingMethod'],
    openingCostSource: policy.openingCostSource as AccountingPolicyValues['openingCostSource'],
    purchaseReturnVariancePurpose:
      policy.purchaseReturnVariancePurpose as AccountingPolicyValues['purchaseReturnVariancePurpose'],
    bonusUnitsTreatment:
      policy.bonusUnitsTreatment as AccountingPolicyValues['bonusUnitsTreatment'],
  };
}
