import { DomainError } from '../../../common/domain-error';
import type { LineTaxSnapshot, TaxSnapshotItem } from '@farmacia/contracts';

/**
 * Motor tributario colombiano (ADR-006, F6). Dominio puro: recibe las reglas del catálogo
 * normativo ya resueltas para la fecha y devuelve tarifas, valores en centavos exactos e
 * instantáneas. No conoce Prisma ni HTTP. Redondeo half-up al centavo.
 */

/** Regla aplicable: del catálogo o copiada en la clasificación del producto */
export interface TaxRuleRef {
  code: string | null;
  treatment: string | null;
  /** Porcentaje con hasta 4 decimales, como texto */
  ratePct: string;
  legalReference?: string | null;
}

export interface WithholdingRuleRef extends TaxRuleRef {
  appliesTo: 'GOODS' | 'SERVICES' | 'ANY';
  payeeCondition: 'DECLARANT' | 'NON_DECLARANT' | 'ANY';
  minBaseUvt: string | null;
}

export interface CompanyTaxStatus {
  vatResponsible: boolean;
  withholdsIncome: boolean;
  withholdsVat: boolean;
  withholdsIca: boolean;
  icaRatePerMil: string | null;
}

export interface PartyTaxStatus {
  vatResponsible: boolean;
  selfWithholder: boolean;
  largeTaxpayer: boolean;
  incomeTaxDeclarant: boolean;
}

export class TaxClassificationMissingError extends DomainError {
  constructor(productName: string, operation: 'venta' | 'compra') {
    super(
      `El producto "${productName}" no tiene clasificación de IVA activa para ${operation}. Clasifíquelo con una regla del catálogo normativo: no se aplica un 0 % implícito.`,
      'conflict',
    );
    this.name = 'TaxClassificationMissingError';
  }
}

export class TaxCatalogIncompleteError extends DomainError {
  constructor(detail: string) {
    super(`El catálogo normativo no tiene lo necesario para esta operación: ${detail}`, 'conflict');
    this.name = 'TaxCatalogIncompleteError';
  }
}

/** Lo que el motor deriva de las responsabilidades del RUT de la empresa */
export function companyTaxStatus(profile: {
  responsibilities: string[];
  icaWithholdingAgent: boolean;
  icaRatePerMil: string | null;
}): CompanyTaxStatus {
  const has = (code: string) => profile.responsibilities.includes(code);
  return {
    vatResponsible: has('48'),
    withholdsIncome: !has('47'),
    withholdsVat: has('13') || has('23'),
    withholdsIca: profile.icaWithholdingAgent && profile.icaRatePerMil !== null,
    icaRatePerMil: profile.icaRatePerMil,
  };
}

export function partyTaxStatus(party: {
  taxResponsibilities: string[];
  isIncomeTaxDeclarant: boolean;
}): PartyTaxStatus {
  const has = (code: string) => party.taxResponsibilities.includes(code);
  return {
    vatResponsible: has('48'),
    selfWithholder: has('15'),
    largeTaxpayer: has('13'),
    incomeTaxDeclarant: party.isIncomeTaxDeclarant,
  };
}

/** Tasa en diezmilésimas: '19' → 1900, '2.5' → 250, '0.966' por mil se maneja aparte */
function basisPoints(ratePct: string): bigint {
  const [whole, fraction = ''] = ratePct.split('.');
  const padded = (fraction + '0000').slice(0, 4);
  // Cuatro decimales de porcentaje = millonésimas; se redondea a centésimas de punto
  const micro = BigInt(whole) * 10000n + BigInt(padded);
  return (micro + 50n) / 100n;
}

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Valor de un impuesto porcentual sobre una base, al centavo */
export function percentOf(baseCents: bigint, ratePct: string): bigint {
  return divideHalfUp(baseCents * basisPoints(ratePct), 10000n);
}

/** Valor de una tarifa por mil (ICA) sobre una base, al centavo */
export function perMilOf(baseCents: bigint, ratePerMil: string): bigint {
  const [whole, fraction = ''] = ratePerMil.split('.');
  const thousandths = BigInt(whole) * 1000n + BigInt((fraction + '000').slice(0, 3));
  return divideHalfUp(baseCents * thousandths, 1_000_000n);
}

/** Decimal positivo como texto a centésimas exactas: '52374' → 5237400n, '27.5' → 2750n */
function hundredths(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}

/** Base mínima en pesos: valor de la UVT × número de UVT, al centavo */
export function uvtToCents(uvtValue: string, uvtCount: string): bigint {
  return divideHalfUp(hundredths(uvtValue) * hundredths(uvtCount), 100n);
}

function money(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Tasa con dos decimales como número, como la guardan las líneas de venta y compra */
export function rateNumber(ratePct: string): number {
  return Number(basisPoints(ratePct)) / 100;
}

function item(
  taxType: TaxSnapshotItem['taxType'],
  rule: TaxRuleRef,
  baseCents: bigint,
  amountCents: bigint,
): TaxSnapshotItem {
  return {
    taxType,
    ruleCode: rule.code,
    treatment: rule.treatment,
    ratePct: rule.ratePct,
    base: money(baseCents),
    amount: money(amountCents),
    legalReference: rule.legalReference ?? null,
  };
}

export type SaleTreatment = 'GRAVADO' | 'EXENTO' | 'EXCLUIDO' | 'NO_RESPONSABLE';

export interface SaleLineTaxResult {
  /** Tarifas con dos decimales para la línea de venta; los valores los calcula la entidad */
  ivaRate: number;
  incRate: number;
  treatment: SaleTreatment;
  snapshot: LineTaxSnapshot;
}

/**
 * Impuestos de una línea de venta. El IVA solo aplica si la empresa es responsable y, en ese
 * caso, el producto debe estar clasificado. El INC aplica si el producto tiene su regla.
 */
export function saleLineTaxes(input: {
  day: string;
  productName: string;
  subtotalCents: bigint;
  company: CompanyTaxStatus;
  iva: TaxRuleRef | null;
  inc: TaxRuleRef | null;
}): SaleLineTaxResult {
  const items: TaxSnapshotItem[] = [];
  let ivaRate = 0;
  let treatment: SaleTreatment = 'NO_RESPONSABLE';
  if (input.company.vatResponsible) {
    if (!input.iva) throw new TaxClassificationMissingError(input.productName, 'venta');
    treatment = (input.iva.treatment ?? 'GRAVADO') as SaleTreatment;
    ivaRate = treatment === 'GRAVADO' ? rateNumber(input.iva.ratePct) : 0;
    items.push(
      item(
        'IVA',
        input.iva,
        input.subtotalCents,
        treatment === 'GRAVADO' ? percentOf(input.subtotalCents, input.iva.ratePct) : 0n,
      ),
    );
  }
  let incRate = 0;
  if (input.inc) {
    incRate = rateNumber(input.inc.ratePct);
    items.push(
      item(
        'INC',
        input.inc,
        input.subtotalCents,
        percentOf(input.subtotalCents, input.inc.ratePct),
      ),
    );
  }
  return { ivaRate, incRate, treatment, snapshot: { engine: 'F6', day: input.day, items } };
}

export interface PurchaseLineTaxInput {
  key: string;
  productName: string;
  subtotalCents: bigint;
  nature: 'GOODS' | 'SERVICES';
  iva: TaxRuleRef | null;
}

export interface PurchaseTaxResult {
  lines: Array<{ key: string; vatRate: number; vatCents: bigint; snapshot: LineTaxSnapshot }>;
  subtotalCents: bigint;
  vatCents: bigint;
  /** IVA descontable (empresa responsable) o mayor costo del inventario */
  vatDeductible: boolean;
  withholdingIncomeCents: bigint;
  withholdingVatCents: bigint;
  withholdingIcaCents: bigint;
  /** Detalle de las retenciones, para la instantánea del documento */
  withholdings: TaxSnapshotItem[];
}

/**
 * Impuestos de una factura de compra: IVA por línea según el proveedor y la clasificación de
 * compra del producto, y las retenciones que practica la empresa sobre la base de cada
 * naturaleza (bienes o servicios) que supere la base mínima en UVT.
 */
export function purchaseTaxes(input: {
  day: string;
  lines: PurchaseLineTaxInput[];
  supplier: PartyTaxStatus;
  company: CompanyTaxStatus;
  withholdingRules: WithholdingRuleRef[];
  vatWithholdingRule: TaxRuleRef | null;
  uvtValue: string | null;
}): PurchaseTaxResult {
  const lines: PurchaseTaxResult['lines'] = [];
  const byNature = new Map<'GOODS' | 'SERVICES', { base: bigint; vat: bigint }>();
  let subtotalCents = 0n;
  let vatCents = 0n;
  for (const line of input.lines) {
    let vatRate = 0;
    let lineVat = 0n;
    const items: TaxSnapshotItem[] = [];
    if (input.supplier.vatResponsible) {
      if (!line.iva) throw new TaxClassificationMissingError(line.productName, 'compra');
      if ((line.iva.treatment ?? 'GRAVADO') === 'GRAVADO') {
        vatRate = rateNumber(line.iva.ratePct);
        lineVat = percentOf(line.subtotalCents, line.iva.ratePct);
      }
      items.push(item('IVA', line.iva, line.subtotalCents, lineVat));
    }
    lines.push({
      key: line.key,
      vatRate,
      vatCents: lineVat,
      snapshot: { engine: 'F6', day: input.day, items },
    });
    subtotalCents += line.subtotalCents;
    vatCents += lineVat;
    const acc = byNature.get(line.nature) ?? { base: 0n, vat: 0n };
    acc.base += line.subtotalCents;
    acc.vat += lineVat;
    byNature.set(line.nature, acc);
  }

  const withholdings: TaxSnapshotItem[] = [];
  let withholdingIncomeCents = 0n;
  let withholdingVatCents = 0n;
  let withholdingIcaCents = 0n;
  const needsWithholding =
    input.company.withholdsIncome || input.company.withholdsVat || input.company.withholdsIca;
  if (needsWithholding) {
    const payee = input.supplier.incomeTaxDeclarant ? 'DECLARANT' : 'NON_DECLARANT';
    for (const [nature, totals] of byNature) {
      const rule = input.withholdingRules.find(
        (r) =>
          (r.appliesTo === nature || r.appliesTo === 'ANY') &&
          (r.payeeCondition === payee || r.payeeCondition === 'ANY'),
      );
      if (!rule) {
        throw new TaxCatalogIncompleteError(
          `no hay concepto de retención en la fuente vigente para ${nature === 'GOODS' ? 'compras' : 'servicios'}.`,
        );
      }
      // La base mínima en UVT decide si la factura está sujeta a retención
      if (rule.minBaseUvt !== null) {
        if (!input.uvtValue)
          throw new TaxCatalogIncompleteError('falta el valor de la UVT del año.');
        if (totals.base < uvtToCents(input.uvtValue, rule.minBaseUvt)) continue;
      }
      if (input.company.withholdsIncome && !input.supplier.selfWithholder) {
        const amount = percentOf(totals.base, rule.ratePct);
        withholdingIncomeCents += amount;
        withholdings.push(item('RETEFUENTE', rule, totals.base, amount));
      }
      if (
        input.company.withholdsVat &&
        input.supplier.vatResponsible &&
        !input.supplier.largeTaxpayer &&
        totals.vat > 0n
      ) {
        if (!input.vatWithholdingRule) {
          throw new TaxCatalogIncompleteError('no hay regla de ReteIVA vigente.');
        }
        const amount = percentOf(totals.vat, input.vatWithholdingRule.ratePct);
        withholdingVatCents += amount;
        withholdings.push(item('RETEIVA', input.vatWithholdingRule, totals.vat, amount));
      }
      if (input.company.withholdsIca && input.company.icaRatePerMil) {
        const amount = perMilOf(totals.base, input.company.icaRatePerMil);
        withholdingIcaCents += amount;
        withholdings.push({
          taxType: 'RETEICA',
          ruleCode: null,
          treatment: null,
          ratePct: `${input.company.icaRatePerMil}‰`,
          base: money(totals.base),
          amount: money(amount),
          legalReference: null,
        });
      }
    }
  }

  return {
    lines,
    subtotalCents,
    vatCents,
    vatDeductible: input.company.vatResponsible,
    withholdingIncomeCents,
    withholdingVatCents,
    withholdingIcaCents,
    withholdings,
  };
}
