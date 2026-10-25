import { DomainError } from '../../../common/domain-error';
/** Candidatos ya filtrados y ordenados por FEFO por el contrato de inventario. */
export interface FefoCandidate {
  id: string;
  current_quantity: number;
}

/** Plan puro: no modifica los lotes ni reserva existencias. */
export function planFefoAllocation<T extends FefoCandidate>(
  lots: readonly T[],
  requiredBaseUnits: number,
): { allocations: { lot: T; quantityBaseUnits: number }[]; shortfallBaseUnits: number } {
  if (!Number.isSafeInteger(requiredBaseUnits) || requiredBaseUnits <= 0) {
    throw new DomainError(
      'Las unidades base requeridas deben ser un entero positivo seguro.',
      'validation',
    );
  }
  const allocations: { lot: T; quantityBaseUnits: number }[] = [];
  let remaining = requiredBaseUnits;
  for (const lot of lots) {
    if (remaining === 0) break;
    const take = Math.min(lot.current_quantity, remaining);
    if (take <= 0) continue;
    allocations.push({ lot, quantityBaseUnits: take });
    remaining -= take;
  }
  return { allocations, shortfallBaseUnits: remaining };
}
