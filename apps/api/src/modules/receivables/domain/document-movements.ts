import type { DocumentMovementDto, DocumentMovementType } from '@farmacia/contracts';

export interface RawDocumentMovement {
  at: Date;
  type: DocumentMovementType;
  documentNumber: string | null;
  description: string;
  paymentMethod?: string | null;
  /** Centavos: positivo aumenta el saldo, negativo lo disminuye */
  deltaCents: bigint;
}

const cents = (value: bigint) => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};

/**
 * Ordena los movimientos de una factura y calcula el saldo después de cada uno. A igual
 * fecha, el cargo de la factura va primero y una reversión después del abono que revierte.
 */
export function buildDocumentMovements(raw: RawDocumentMovement[]): DocumentMovementDto[] {
  const order: Record<DocumentMovementType, number> = {
    CARGO: 0,
    NOTA_DEBITO: 1,
    ABONO: 2,
    NOTA_CREDITO: 3,
    REVERSION_ABONO: 4,
    ANULACION: 5,
  };
  let balance = 0n;
  return [...raw]
    .sort((a, b) => a.at.getTime() - b.at.getTime() || order[a.type] - order[b.type])
    .map((movement) => {
      balance += movement.deltaCents;
      return {
        date: movement.at.toISOString(),
        type: movement.type,
        documentNumber: movement.documentNumber,
        description: movement.description,
        paymentMethod: movement.paymentMethod ?? null,
        charge: cents(movement.deltaCents > 0n ? movement.deltaCents : 0n),
        credit: cents(movement.deltaCents < 0n ? -movement.deltaCents : 0n),
        balance: cents(balance),
      };
    });
}
