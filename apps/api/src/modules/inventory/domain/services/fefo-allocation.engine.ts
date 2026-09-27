import {
  InsufficientInventoryException,
  NegativeQuantityException,
} from '../exceptions/inventory.exceptions';
import type { FefoAllocationItem, FefoAllocationResult } from '@farmacia/contracts';

export interface LotCandidate {
  id: string;
  lotNumber: string;
  expirationDate: Date;
  availableQuantity: number;
}

export class FefoAllocationEngine {
  /**
   * Distribuye una cantidad demandada en unidades base entre los lotes candidatos disponibles,
   * ordenados prioritariamente por fecha de vencimiento más próxima (FEFO).
   *
   * Reglas:
   * 1. No asigna lotes vencidos si referenceDate está definida.
   * 2. Si el primer lote no cubre el total, fracciona (split allocation) en los siguientes.
   * 3. Lanza InsufficientInventoryException si la suma no alcanza para satisfacer la demanda.
   */
  public static allocate(
    productId: string,
    requestedQuantity: number,
    candidates: LotCandidate[],
    referenceDate: Date = new Date(),
  ): FefoAllocationResult {
    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
      throw new NegativeQuantityException(
        'La cantidad a asignar por FEFO debe ser un entero estrictamente mayor a 0.',
      );
    }

    const ref = new Date(referenceDate);
    ref.setHours(0, 0, 0, 0);

    // Filtrar lotes vencidos y ordenar por vencimiento ascendente
    const sortedLots = candidates
      .filter((lot) => {
        const exp = new Date(lot.expirationDate);
        exp.setHours(0, 0, 0, 0);
        return exp.getTime() >= ref.getTime() && lot.availableQuantity > 0;
      })
      .sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());

    const totalAvailable = sortedLots.reduce(
      (sum, lot) => sum + lot.availableQuantity,
      0,
    );

    if (totalAvailable < requestedQuantity) {
      throw new InsufficientInventoryException(
        `Inventario no vencido insuficiente. Requerido: ${requestedQuantity}, Disponible: ${totalAvailable}`,
      );
    }

    let remainingToAllocate = requestedQuantity;
    const allocations: FefoAllocationItem[] = [];

    for (const lot of sortedLots) {
      if (remainingToAllocate <= 0) break;

      const takeFromLot = Math.min(lot.availableQuantity, remainingToAllocate);
      allocations.push({
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        expirationDate: lot.expirationDate.toISOString().split('T')[0],
        quantityBaseUnits: takeFromLot,
      });

      remainingToAllocate -= takeFromLot;
    }

    return {
      productId,
      totalAllocated: requestedQuantity,
      allocations,
    };
  }
}
