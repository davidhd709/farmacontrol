/** Perfil tributario documentado por SKU y operación; las fechas son YYYY-MM-DD. */
export const PRODUCT_TAX_OPERATIONS = ['SALE', 'PURCHASE'] as const;
export type ProductTaxOperation = (typeof PRODUCT_TAX_OPERATIONS)[number];

export const PRODUCT_TAX_TREATMENTS = ['GRAVADO', 'EXENTO', 'EXCLUIDO', 'NO_APLICA'] as const;
export type ProductTaxTreatment = (typeof PRODUCT_TAX_TREATMENTS)[number];

export interface ProductTaxProfileInput {
  productId: string;
  operation: ProductTaxOperation;
  treatment: ProductTaxTreatment;
  ratePct?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  documentReference?: string | null;
}

export type UpdateProductTaxProfileInput = Partial<
  Pick<
    ProductTaxProfileInput,
    'treatment' | 'ratePct' | 'effectiveFrom' | 'effectiveTo' | 'documentReference'
  >
>;

export interface ProductTaxProfileDto {
  id: string;
  productId: string;
  operation: ProductTaxOperation;
  treatment: ProductTaxTreatment;
  ratePct: string | null;
  status: 'DRAFT' | 'ACTIVE';
  effectiveFrom: string;
  effectiveTo: string | null;
  documentReference: string | null;
  activatedById: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
