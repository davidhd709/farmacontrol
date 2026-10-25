import { z } from 'zod';

/** Pesos de la DIAN para el dígito de verificación (el backend repite la validación). */
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function nitCheckDigit(taxId: string): string | null {
  if (!/^[0-9]{5,15}$/.test(taxId)) return null;
  const sum = taxId
    .split('')
    .reverse()
    .reduce((total, digit, i) => total + Number(digit) * NIT_WEIGHTS[i], 0);
  const remainder = sum % 11;
  return String(remainder > 1 ? 11 - remainder : remainder);
}

const optionalText = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);
const municipality = z
  .string()
  .trim()
  .refine((v) => v === '' || /^[0-9]{5}$/.test(v), 'El código DANE tiene 5 dígitos');

export const companySetupSchema = z
  .object({
    legalName: z.string().trim().min(1, 'La razón social es obligatoria').max(200),
    tradeName: optionalText(200),
    taxId: z
      .string()
      .trim()
      .regex(/^[0-9]{5,15}$/, 'El NIT tiene entre 5 y 15 dígitos, sin puntos ni guion'),
    taxIdCheckDigit: z
      .string()
      .trim()
      .regex(/^[0-9]$/, 'Un solo dígito'),
    municipalityCode: municipality,
    address: optionalText(250),
    email: z
      .string()
      .trim()
      .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Correo no válido'),
    phone: optionalText(30),
    branchCode: z.string().trim().min(1, 'El código de la sede es obligatorio').max(20),
    branchName: z.string().trim().min(1, 'El nombre de la sede es obligatorio').max(150),
  })
  .superRefine((data, ctx) => {
    const expected = nitCheckDigit(data.taxId);
    if (
      expected !== null &&
      /^[0-9]$/.test(data.taxIdCheckDigit) &&
      expected !== data.taxIdCheckDigit
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['taxIdCheckDigit'],
        message: `No corresponde al NIT; debería ser ${expected}`,
      });
    }
  });
export type CompanySetupFormData = z.infer<typeof companySetupSchema>;

export const branchSchema = z.object({
  code: z.string().trim().min(1, 'El código es obligatorio').max(20),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(150),
  municipalityCode: municipality,
});
export type BranchFormData = z.infer<typeof branchSchema>;

export const policySchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha obligatoria'),
  costingMethod: z.enum(['WEIGHTED_AVERAGE', 'FIFO', 'SPECIFIC_LOT']),
  openingCostSource: z.enum(['LAST_PURCHASE_THEN_CATALOG', 'CATALOG']),
  purchaseReturnVariancePurpose: z.enum(['COST_OF_SALES', 'INVENTORY_COST_VARIANCE']),
  bonusUnitsTreatment: z.enum(['ZERO_COST_IN_AVERAGE']),
  reason: z.string().trim().min(1, 'Explica el motivo del cambio').max(500),
});
export type PolicyFormData = z.infer<typeof policySchema>;
