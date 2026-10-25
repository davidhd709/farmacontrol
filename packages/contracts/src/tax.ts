/** Catálogo normativo colombiano y motor tributario (ADR-006, F6). Fechas YYYY-MM-DD. */

/** Responsabilidades del RUT que usa el motor (códigos DIAN). */
export const RUT_RESPONSIBILITIES = [
  { code: '13', label: 'Gran contribuyente' },
  { code: '15', label: 'Autorretenedor' },
  { code: '23', label: 'Agente de retención en el impuesto sobre las ventas' },
  { code: '47', label: 'Régimen simple de tributación' },
  { code: '48', label: 'Responsable del impuesto sobre las ventas (IVA)' },
  { code: '49', label: 'No responsable de IVA' },
  { code: 'R-99-PN', label: 'No aplica - Otros' },
] as const;
export type RutResponsibilityCode = (typeof RUT_RESPONSIBILITIES)[number]['code'];
export const RUT_RESPONSIBILITY_CODES: readonly string[] = RUT_RESPONSIBILITIES.map((r) => r.code);

export const TAX_TYPES = ['IVA', 'INC', 'RETEFUENTE', 'RETEIVA', 'RETEICA'] as const;
export type TaxType = (typeof TAX_TYPES)[number];

/** Impuestos con los que se clasifica un producto */
export const PRODUCT_TAX_TYPES = ['IVA', 'INC'] as const;
export type ProductTaxType = (typeof PRODUCT_TAX_TYPES)[number];

export const ICA_ACTIVITIES = ['INDUSTRIAL', 'COMERCIAL', 'SERVICIOS'] as const;
export type IcaActivity = (typeof ICA_ACTIVITIES)[number];

export type TaxReviewStatus = 'PENDING_ADVISOR_REVIEW' | 'REVIEWED';

export interface TaxRuleDto {
  id: string;
  code: string;
  taxType: TaxType;
  treatment: 'GRAVADO' | 'EXENTO' | 'EXCLUIDO' | null;
  description: string;
  ratePct: string | null;
  rateMinPerMil: string | null;
  rateMaxPerMil: string | null;
  minBaseUvt: string | null;
  appliesTo: 'GOODS' | 'SERVICES' | 'ANY';
  payeeCondition: 'DECLARANT' | 'NON_DECLARANT' | 'ANY';
  legalReference: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reviewStatus: TaxReviewStatus;
}

export interface UvtValueDto {
  year: number;
  value: string;
  legalReference: string;
  reviewStatus: TaxReviewStatus;
}

export interface TaxCatalogDto {
  /** Día al que corresponden las reglas vigentes */
  day: string;
  rules: TaxRuleDto[];
  uvt: UvtValueDto[];
  responsibilities: ReadonlyArray<{ code: string; label: string }>;
  /** true si alguna regla o UVT vigente sigue pendiente de revisión del asesor tributario */
  pendingAdvisorReview: boolean;
}

export interface CompanyTaxProfileDto {
  id: string;
  effectiveFrom: string;
  responsibilities: string[];
  icaActivity: IcaActivity | null;
  icaRatePerMil: string | null;
  icaWithholdingAgent: boolean;
  reason: string;
  createdByUsername: string | null;
  createdAt: string;
  /** Lo que el motor deriva de las responsabilidades */
  derived: {
    vatResponsible: boolean;
    withholdsIncome: boolean;
    withholdsVat: boolean;
    withholdsIca: boolean;
  };
}

export interface CreateCompanyTaxProfilePayload {
  effectiveFrom: string;
  responsibilities: string[];
  icaActivity?: IcaActivity | null;
  icaRatePerMil?: string | null;
  icaWithholdingAgent?: boolean;
  reason: string;
}

export interface CompanyTaxProfilesDto {
  current: CompanyTaxProfileDto | null;
  history: CompanyTaxProfileDto[];
}

/** Lo que el motor aplicó a una línea; se guarda como instantánea */
export interface TaxSnapshotItem {
  taxType: TaxType;
  ruleCode: string | null;
  treatment: string | null;
  ratePct: string;
  base: string;
  amount: string;
  legalReference?: string | null;
}

export interface LineTaxSnapshot {
  engine: 'F6';
  day: string;
  items: TaxSnapshotItem[];
}

/** Tarifas de venta vigentes de un producto, para que el POS calcule igual que el backend */
export interface ProductSaleTaxDto {
  ivaRatePct: string;
  incRatePct: string;
  /** La empresa es responsable de IVA y el producto no tiene clasificación activa */
  missingClassification: boolean;
}

/** Borradores tributarios (ADR-006, F8): apoyo para la contadora, no el formulario oficial. */
export interface VatDraftDto {
  from: string;
  to: string;
  draft: true;
  sales: Array<{ treatment: string; ratePct: string; base: string; vat: string }>;
  salesReturns: { base: string; vat: string };
  inc: { base: string; amount: string; returns: string };
  purchases: Array<{ ratePct: string; base: string; vat: string }>;
  purchaseReturns: { base: string; vat: string };
  vatGenerated: string;
  vatDeductible: string;
  /** Positivo: saldo a pagar; negativo: saldo a favor */
  balance: string;
}

export interface WithholdingDraftDto {
  from: string;
  to: string;
  draft: true;
  concepts: Array<{ taxType: string; ruleCode: string | null; base: string; amount: string }>;
  reversed: { income: string; vat: string; ica: string };
  totals: { income: string; vat: string; ica: string; total: string };
}

export interface IcaDraftDto {
  from: string;
  to: string;
  draft: true;
  grossIncome: string;
  returns: string;
  netIncome: string;
  activity: string | null;
  ratePerMil: string | null;
  tax: string;
  withheldIca: string;
}

export interface ExogenousDraftDto {
  year: number;
  draft: true;
  /** Formato 1001: pagos o abonos en cuenta y retenciones practicadas */
  payments: Array<{
    taxId: string;
    name: string;
    amount: string;
    vat: string;
    withholdingIncome: string;
    withholdingVat: string;
  }>;
  /** Formato 1007: ingresos recibidos */
  income: Array<{ documentNumber: string; name: string; amount: string; returns: string }>;
}
