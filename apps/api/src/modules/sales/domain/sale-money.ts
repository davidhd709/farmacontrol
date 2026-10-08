/**
 * Aritmética monetaria del dominio de ventas en centavos enteros (AUD-010).
 *
 * Los valores llegan como `number` desde la API y la base de datos (Decimal(12,2)),
 * pero todos los cálculos de líneas y totales se hacen en `bigint` para no acumular
 * errores de coma flotante. Los resultados vuelven a `number` solo al final, siempre
 * con exactamente dos decimales.
 */

export class SaleMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaleMoneyError';
  }
}

const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

function toHundredths(value: number, name: string): bigint {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SaleMoneyError(`${name} debe ser un número válido.`);
  }
  if (value < 0) {
    throw new SaleMoneyError(`${name} no puede ser negativo.`);
  }
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new SaleMoneyError(`${name} admite como máximo dos decimales.`);
  }
  const result = BigInt(rounded);
  if (result > MAX_SAFE_CENTS) {
    throw new SaleMoneyError(`${name} excede el valor máximo permitido.`);
  }
  return result;
}

/** Convierte un valor monetario con máximo dos decimales a centavos. */
export function moneyToCents(value: number, name = 'El valor'): bigint {
  return toHundredths(value, name);
}

/** Convierte una cantidad comercial (máximo dos decimales) a centésimas de unidad. */
export function quantityToHundredths(value: number, name = 'La cantidad'): bigint {
  return toHundredths(value, name);
}

/** División entera redondeando a la mitad hacia arriba (solo valores no negativos). */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (2n * denominator);
}

/** Valor bruto de una línea: cantidad (centésimas) × precio (centavos), redondeado al centavo. */
export function lineGrossCents(quantityHundredths: bigint, unitPriceCents: bigint): bigint {
  return divideRoundHalfUp(quantityHundredths * unitPriceCents, 100n);
}

/** Aplica un porcentaje con máximo dos decimales (p. ej. IVA 19 o 5.5) a un valor en centavos. */
export function percentageOfCents(amountCents: bigint, ratePct: number): bigint {
  const rateHundredths = toHundredths(ratePct, 'La tarifa');
  return divideRoundHalfUp(amountCents * rateHundredths, 10000n);
}

export function centsToNumber(cents: bigint): number {
  return Number(cents) / 100;
}
