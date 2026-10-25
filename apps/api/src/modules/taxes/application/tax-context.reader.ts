import { type Prisma, type PrismaClient, type CompanyTaxProfile } from '@farmacia/database';
import type { ProductSaleTaxDto } from '@farmacia/contracts';
import { companyTaxStatus, type CompanyTaxStatus, type TaxRuleRef } from '../domain/tax-engine';

type Client = Prisma.TransactionClient | PrismaClient;

/**
 * Perfil tributario vigente de la empresa activa en un día. Sin perfil, el motor tributario
 * no se aplica y las operaciones siguen como antes de F6 (ADR-006).
 */
export async function companyTaxProfileAt(
  client: Client,
  day: string,
): Promise<CompanyTaxProfile | null> {
  const company = await client.company.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  if (!company) return null;
  return client.companyTaxProfile.findFirst({
    where: { companyId: company.id, effectiveFrom: { lte: new Date(`${day}T00:00:00.000Z`) } },
    orderBy: { effectiveFrom: 'desc' },
  });
}

export async function companyTaxStatusAt(
  client: Client,
  day: string,
): Promise<CompanyTaxStatus | null> {
  const profile = await companyTaxProfileAt(client, day);
  if (!profile) return null;
  return companyTaxStatus({
    responsibilities: profile.responsibilities,
    icaWithholdingAgent: profile.icaWithholdingAgent,
    icaRatePerMil: profile.icaRatePerMil?.toFixed(3) ?? null,
  });
}

/** Clasificación activa de un producto (IVA e INC) para una operación en un día. */
export async function productTaxRulesAt(
  client: Client,
  productId: string,
  operation: 'SALE' | 'PURCHASE',
  day: string,
): Promise<{ iva: TaxRuleRef | null; inc: TaxRuleRef | null }> {
  const date = new Date(`${day}T00:00:00.000Z`);
  const profiles = await client.productTaxProfile.findMany({
    where: {
      productId,
      operation,
      status: 'ACTIVE',
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    },
    include: { taxRule: { select: { code: true, legalReference: true } } },
    orderBy: { effectiveFrom: 'desc' },
  });
  const ref = (taxType: string): TaxRuleRef | null => {
    const profile = profiles.find((p) => p.taxType === taxType);
    if (!profile || profile.ratePct === null) return null;
    return {
      code: profile.taxRule?.code ?? null,
      treatment: profile.treatment,
      ratePct: profile.ratePct.toFixed(4),
      legalReference: profile.taxRule?.legalReference ?? profile.documentReference,
    };
  };
  return { iva: ref('IVA'), inc: ref('INC') };
}

/**
 * Tarifas de venta vigentes de varios productos (POS), en una sola consulta. Devuelve null si
 * el motor tributario no está activo para la empresa.
 */
export async function saleTaxRatesAt(
  client: Client,
  productIds: string[],
  day: string,
): Promise<Map<string, ProductSaleTaxDto> | null> {
  const status = await companyTaxStatusAt(client, day);
  if (!status) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  const profiles = productIds.length
    ? await client.productTaxProfile.findMany({
        where: {
          productId: { in: productIds },
          operation: 'SALE',
          status: 'ACTIVE',
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      })
    : [];
  const rates = new Map<string, ProductSaleTaxDto>();
  for (const productId of productIds) {
    const iva = profiles.find((p) => p.productId === productId && p.taxType === 'IVA');
    const inc = profiles.find((p) => p.productId === productId && p.taxType === 'INC');
    const ivaApplies = status.vatResponsible && iva?.treatment === 'GRAVADO';
    rates.set(productId, {
      ivaRatePct: ivaApplies ? iva!.ratePct!.toFixed(2) : '0.00',
      incRatePct: inc?.ratePct ? inc.ratePct.toFixed(2) : '0.00',
      missingClassification: status.vatResponsible && !iva,
    });
  }
  return rates;
}
