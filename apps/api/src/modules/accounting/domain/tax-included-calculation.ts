import { AccountingValidationError } from './accounting-rules';

export const TAX_TREATMENTS = ['GRAVADO', 'EXENTO', 'EXCLUIDO', 'NO_APLICA'] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

export interface TaxIncludedLineInput {
  unitPrice: string;
  quantity: string;
  discount: string;
  treatment: TaxTreatment;
  rate: string;
}

export interface TaxIncludedLineResult {
  treatment: TaxTreatment;
  rate: string;
  gross: string;
  discount: string;
  taxableBase: string;
  tax: string;
  total: string;
}

const MAX_CENTS = 99999999999999999999n; // Hasta 18 dígitos enteros y 2 decimales.

function parseFixed(value: string, decimals: number, integerDigits: number, name: string): bigint {
  if (typeof value !== 'string')
    throw new AccountingValidationError(`${name} debe ser texto decimal.`);
  const match = new RegExp(`^([0-9]{1,${integerDigits}})(?:\\.([0-9]{1,${decimals}}))?$`).exec(
    value,
  );
  if (!match) throw new AccountingValidationError(`${name} tiene un formato decimal inválido.`);
  return (
    BigInt(match[1]) * 10n ** BigInt(decimals) +
    BigInt((match[2] ?? '').padEnd(decimals, '0') || '0')
  );
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function asMoney(cents: bigint): string {
  if (cents < 0n || cents > MAX_CENTS)
    throw new AccountingValidationError('El importe excede el máximo contable admitido.');
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/**
 * Desglosa una línea cuyo precio unitario ya incluye IVA. Toda la aritmética es entera.
 * Redondeo half-up por línea: primero precio × cantidad a centavos, después base neta.
 * Esta política de redondeo es provisional y requiere aprobación contable antes de activar.
 */
export function calculateTaxIncludedLine(input: TaxIncludedLineInput): TaxIncludedLineResult {
  if (!input || typeof input !== 'object')
    throw new AccountingValidationError('Línea tributaria inválida.');
  const unitPrice = parseFixed(input.unitPrice, 2, 18, 'Precio unitario');
  const quantity = parseFixed(input.quantity, 4, 12, 'Cantidad');
  const discount = parseFixed(input.discount, 2, 18, 'Descuento');
  const rate = parseFixed(input.rate, 2, 3, 'Tarifa');
  if (!TAX_TREATMENTS.includes(input.treatment))
    throw new AccountingValidationError('Tratamiento tributario inválido.');
  if (unitPrice <= 0n || quantity <= 0n)
    throw new AccountingValidationError('Precio y cantidad deben ser mayores que cero.');
  if (input.treatment === 'GRAVADO' ? rate <= 0n : rate !== 0n)
    throw new AccountingValidationError('La tarifa no corresponde al tratamiento tributario.');

  const gross = roundHalfUp(unitPrice * quantity, 10000n);
  if (gross > MAX_CENTS)
    throw new AccountingValidationError('El importe excede el máximo contable admitido.');
  if (discount > gross)
    throw new AccountingValidationError('El descuento no puede superar el importe bruto.');
  const total = gross - discount;
  const taxableBase =
    input.treatment === 'GRAVADO' ? roundHalfUp(total * 10000n, 10000n + rate) : total;
  const tax = total - taxableBase;

  return {
    treatment: input.treatment,
    rate: `${rate / 100n}.${(rate % 100n).toString().padStart(2, '0')}`,
    gross: asMoney(gross),
    discount: asMoney(discount),
    taxableBase: asMoney(taxableBase),
    tax: asMoney(tax),
    total: asMoney(total),
  };
}
