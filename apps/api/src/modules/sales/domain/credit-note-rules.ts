/**
 * Reglas puras para calcular una nota crédito sobre una línea de venta (AUD-007).
 * Todos los montos en centavos y las cantidades comerciales en centésimas.
 */

export interface LineAmountsCents {
  subtotal: bigint;
  tax: bigint;
}

/** División entera redondeando a la mitad hacia arriba (valores no negativos). */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (2n * denominator);
}

/**
 * Montos a devolver por `returnedHundredths` de una línea vendida por `soldHundredths`.
 * Usa el subtotal neto de la línea (ya con descuento) y su IVA, proporcionales a la
 * cantidad. Cuando la devolución completa la línea, devuelve exactamente lo que falta
 * para que la suma de todas las notas iguale el valor vendido, sin centavos sobrantes.
 */
export function creditAmountsForLine(params: {
  soldHundredths: bigint;
  previouslyReturnedHundredths: bigint;
  returnedHundredths: bigint;
  line: LineAmountsCents;
  previouslyCredited: LineAmountsCents;
}): LineAmountsCents {
  const {
    soldHundredths,
    previouslyReturnedHundredths,
    returnedHundredths,
    line,
    previouslyCredited,
  } = params;
  if (previouslyReturnedHundredths + returnedHundredths === soldHundredths) {
    return {
      subtotal: line.subtotal - previouslyCredited.subtotal,
      tax: line.tax - previouslyCredited.tax,
    };
  }
  return {
    subtotal: divideRoundHalfUp(line.subtotal * returnedHundredths, soldHundredths),
    tax: divideRoundHalfUp(line.tax * returnedHundredths, soldHundredths),
  };
}

export interface LotCapacity {
  lotId: string;
  /** Unidades base vendidas de ese lote menos las ya devueltas a él. */
  availableBaseUnits: number;
}

export interface LotReturnPortion {
  lotId: string;
  baseUnits: number;
}

/**
 * Reparte las unidades devueltas entre los lotes de los que salió la venta, sin devolver
 * a un lote más de lo que salió de él. Recorre los lotes en el orden de la asignación FEFO.
 */
export function splitReturnAcrossLots(baseUnits: number, lots: LotCapacity[]): LotReturnPortion[] {
  const portions: LotReturnPortion[] = [];
  let remaining = baseUnits;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.availableBaseUnits, remaining);
    if (take > 0) {
      portions.push({ lotId: lot.lotId, baseUnits: take });
      remaining -= take;
    }
  }
  if (remaining > 0) {
    throw new Error(
      `No hay unidades vendidas suficientes en los lotes originales para reintegrar ${baseUnits} unidades.`,
    );
  }
  return portions;
}

/**
 * Divide un total entre porciones proporcionales a sus pesos; la última porción recibe
 * el residuo para que la suma sea exacta.
 */
export function splitProportionally(total: bigint, weights: bigint[]): bigint[] {
  const sumWeights = weights.reduce((a, b) => a + b, 0n);
  if (sumWeights === 0n) return weights.map(() => 0n);
  const parts: bigint[] = [];
  let assigned = 0n;
  weights.forEach((w, i) => {
    if (i === weights.length - 1) {
      parts.push(total - assigned);
    } else {
      const part = divideRoundHalfUp(total * w, sumWeights);
      parts.push(part);
      assigned += part;
    }
  });
  return parts;
}
