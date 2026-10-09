export type CreditNoteRefundMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'CREDITO_CARTERA';

const SUPPORTED_REFUND_METHODS: readonly CreditNoteRefundMethod[] = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'CREDITO_CARTERA',
];

/**
 * Por defecto el dinero vuelve por el mismo medio con el que se pagó la venta.
 * Devuelve null si el medio solicitado no está soportado.
 */
export function resolveRefundMethod(
  salePaymentMethod: string,
  requested?: string,
): CreditNoteRefundMethod | null {
  if (requested !== undefined) {
    return (SUPPORTED_REFUND_METHODS as readonly string[]).includes(requested)
      ? (requested as CreditNoteRefundMethod)
      : null;
  }
  if (salePaymentMethod === 'CREDITO') return 'CREDITO_CARTERA';
  if (salePaymentMethod === 'TRANSFERENCIA') return 'TRANSFERENCIA';
  return 'EFECTIVO';
}

/**
 * Parte proporcional en centavos (redondeo half-up): amountCents * part / whole.
 */
export function prorateCents(amountCents: bigint, part: number, whole: number): bigint {
  if (whole <= 0) throw new Error('El total para prorratear debe ser mayor a cero.');
  const numerator = amountCents * BigInt(part) * 2n + BigInt(whole);
  return numerator / (BigInt(whole) * 2n);
}

export interface LotAllocationForReturn {
  lotId: string;
  quantityBaseUnits: number;
  expirationDate: Date;
}

/**
 * Orden FEFO original de la venta: primero el lote que vencía antes.
 */
export function sortAllocationsFefo<T extends { lotId: string; quantityBaseUnits: number; lot: { expirationDate: Date } }>(
  allocations: T[],
): LotAllocationForReturn[] {
  return allocations
    .map((a) => ({
      lotId: a.lotId,
      quantityBaseUnits: a.quantityBaseUnits,
      expirationDate: a.lot.expirationDate,
    }))
    .sort(
      (a, b) =>
        a.expirationDate.getTime() - b.expirationDate.getTime() || a.lotId.localeCompare(b.lotId),
    );
}

export interface ReturnPortion {
  lotId: string | null;
  quantityBaseUnits: number;
}

/**
 * Reparte una devolución entre los lotes de los que salió la venta.
 * Las devoluciones se consumen de las asignaciones en orden FEFO: las unidades
 * ya devueltas ocupan las primeras y la devolución actual sigue a continuación,
 * de modo que ningún lote recibe más de lo que entregó.
 */
export function splitReturnAcrossLots(
  allocations: LotAllocationForReturn[],
  alreadyReturnedBaseUnits: number,
  returnBaseUnits: number,
): ReturnPortion[] {
  if (allocations.length === 0) {
    return [{ lotId: null, quantityBaseUnits: returnBaseUnits }];
  }

  let skip = alreadyReturnedBaseUnits;
  let pending = returnBaseUnits;
  const portions: ReturnPortion[] = [];

  for (const allocation of allocations) {
    if (pending === 0) break;
    const consumed = Math.min(skip, allocation.quantityBaseUnits);
    skip -= consumed;
    const available = allocation.quantityBaseUnits - consumed;
    if (available === 0) continue;
    const take = Math.min(available, pending);
    portions.push({ lotId: allocation.lotId, quantityBaseUnits: take });
    pending -= take;
  }

  if (pending > 0) {
    throw new Error('La devolución supera las unidades asignadas a los lotes de la venta.');
  }
  return portions;
}
