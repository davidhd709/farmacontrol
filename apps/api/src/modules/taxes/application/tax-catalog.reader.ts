import { prisma, type Prisma, type PrismaClient, type TaxRule } from '@farmacia/database';
import {
  RUT_RESPONSIBILITIES,
  type TaxCatalogDto,
  type TaxRuleDto,
  type TaxType,
} from '@farmacia/contracts';
import type { TaxRuleRef, WithholdingRuleRef } from '../domain/tax-engine';

type Client = Prisma.TransactionClient | PrismaClient;

const dayDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const dateText = (date: Date) => date.toISOString().slice(0, 10);

/** Reglas vigentes en un día; si un código tiene varias versiones vigentes gana la más reciente. */
function inForce(day: string): Prisma.TaxRuleWhereInput {
  return {
    effectiveFrom: { lte: dayDate(day) },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: dayDate(day) } }],
  };
}

function latestPerCode(rules: TaxRule[]): TaxRule[] {
  const byCode = new Map<string, TaxRule>();
  for (const rule of rules) {
    const current = byCode.get(rule.code);
    if (!current || rule.effectiveFrom > current.effectiveFrom) byCode.set(rule.code, rule);
  }
  return [...byCode.values()];
}

export function toTaxRuleDto(rule: TaxRule): TaxRuleDto {
  return {
    id: rule.id,
    code: rule.code,
    taxType: rule.taxType as TaxType,
    treatment: rule.treatment as TaxRuleDto['treatment'],
    description: rule.description,
    ratePct: rule.ratePct?.toFixed(4) ?? null,
    rateMinPerMil: rule.rateMinPerMil?.toFixed(3) ?? null,
    rateMaxPerMil: rule.rateMaxPerMil?.toFixed(3) ?? null,
    minBaseUvt: rule.minBaseUvt?.toFixed(2) ?? null,
    appliesTo: rule.appliesTo as TaxRuleDto['appliesTo'],
    payeeCondition: rule.payeeCondition as TaxRuleDto['payeeCondition'],
    legalReference: rule.legalReference,
    effectiveFrom: dateText(rule.effectiveFrom),
    effectiveTo: rule.effectiveTo ? dateText(rule.effectiveTo) : null,
    reviewStatus: rule.reviewStatus as TaxRuleDto['reviewStatus'],
  };
}

export function toRuleRef(rule: TaxRule): TaxRuleRef {
  return {
    code: rule.code,
    treatment: rule.treatment,
    ratePct: rule.ratePct?.toFixed(4) ?? '0.0000',
    legalReference: rule.legalReference,
  };
}

/** Catálogo normativo vigente en un día, para consulta (ADR-006, F6). */
export async function taxCatalogAt(day: string, client: Client = prisma): Promise<TaxCatalogDto> {
  const rules = latestPerCode(
    await client.taxRule.findMany({
      where: inForce(day),
      orderBy: [{ taxType: 'asc' }, { code: 'asc' }],
    }),
  );
  const uvt = await client.uvtValue.findMany({ orderBy: { year: 'desc' } });
  const year = Number(day.slice(0, 4));
  return {
    day,
    rules: rules.map(toTaxRuleDto),
    uvt: uvt.map((u) => ({
      year: u.year,
      value: u.value.toFixed(2),
      legalReference: u.legalReference,
      reviewStatus: u.reviewStatus as TaxCatalogDto['uvt'][number]['reviewStatus'],
    })),
    responsibilities: RUT_RESPONSIBILITIES,
    pendingAdvisorReview:
      rules.some((r) => r.reviewStatus !== 'REVIEWED') ||
      uvt.some((u) => u.year === year && u.reviewStatus !== 'REVIEWED'),
  };
}

/** Regla vigente por código, o null si no hay versión vigente ese día. */
export async function taxRuleAt(
  client: Client,
  code: string,
  day: string,
): Promise<TaxRule | null> {
  return client.taxRule.findFirst({
    where: { code, ...inForce(day) },
    orderBy: { effectiveFrom: 'desc' },
  });
}

/** Conceptos de retención en la fuente vigentes, para el motor. */
export async function withholdingRulesAt(
  client: Client,
  day: string,
): Promise<WithholdingRuleRef[]> {
  const rules = latestPerCode(
    await client.taxRule.findMany({ where: { taxType: 'RETEFUENTE', ...inForce(day) } }),
  );
  return rules.map((rule) => ({
    ...toRuleRef(rule),
    appliesTo: rule.appliesTo as WithholdingRuleRef['appliesTo'],
    payeeCondition: rule.payeeCondition as WithholdingRuleRef['payeeCondition'],
    minBaseUvt: rule.minBaseUvt?.toFixed(2) ?? null,
  }));
}

export async function vatWithholdingRuleAt(
  client: Client,
  day: string,
): Promise<TaxRuleRef | null> {
  const rules = latestPerCode(
    await client.taxRule.findMany({ where: { taxType: 'RETEIVA', ...inForce(day) } }),
  );
  return rules[0] ? toRuleRef(rules[0]) : null;
}

/** Valor de la UVT del año del día indicado, como texto con dos decimales. */
export async function uvtValueAt(client: Client, day: string): Promise<string | null> {
  const row = await client.uvtValue.findUnique({ where: { year: Number(day.slice(0, 4)) } });
  return row ? row.value.toFixed(2) : null;
}
