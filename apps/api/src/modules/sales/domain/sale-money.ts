/**
 * Aritmética monetaria de la venta en centavos enteros (bigint).
 * Los importes de entrada llegan como number con a lo sumo dos decimales;
 * todo cálculo intermedio se hace en centavos y se redondea half-up de forma explícita.
 */

const EPSILON = 1e-6;

/** Convierte un valor con hasta dos decimales a centésimas exactas. */
export function toHundredths(value: number, label: string): bigint {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} no es un número válido.`);
  }
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > EPSILON) {
    throw new Error(`${label} admite como máximo dos decimales (${value}).`);
  }
  return BigInt(rounded);
}

/** División entera con redondeo half-up para valores no negativos. */
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Centavos a number con dos decimales exactos para DTOs y persistencia. */
export function centsToNumber(cents: bigint): number {
  return Number(cents) / 100;
}
