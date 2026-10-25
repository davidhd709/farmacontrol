import { InventoryDomainException } from '../exceptions/inventory.exceptions';
import { divideHalfUp } from './weighted-average';

/**
 * Capas de costo para PEPS y costo identificado (F5, ADR-006), en unidades base y centavos
 * exactos. Una salida parcial toma la parte proporcional de la capa con redondeo half-up y la
 * que la agota se lleva el valor remanente: la suma de las salidas coincide con lo que entró.
 */
export interface CostLayer {
  id: string;
  quantityRemaining: number;
  valueRemainingCents: bigint;
}

export interface LayerConsumption {
  layerId: string;
  quantityBaseUnits: number;
  valueCents: bigint;
}

/** Consume las capas en el orden recibido (el llamador decide PEPS o la existencia). */
export function consumeLayers(
  layers: CostLayer[],
  quantityBaseUnits: number,
): { consumed: LayerConsumption[]; valueCents: bigint } {
  if (!Number.isSafeInteger(quantityBaseUnits) || quantityBaseUnits <= 0) {
    throw new InventoryDomainException(
      'La cantidad valorizada debe ser un entero positivo de unidades base.',
    );
  }
  const available = layers.reduce((sum, layer) => sum + layer.quantityRemaining, 0);
  if (available < quantityBaseUnits) {
    throw new InventoryDomainException(
      `Las capas de costo tienen ${available} unidades base y se intentó retirar ${quantityBaseUnits}.`,
      'conflict',
    );
  }
  const consumed: LayerConsumption[] = [];
  let pending = quantityBaseUnits;
  let valueCents = 0n;
  for (const layer of layers) {
    if (pending === 0) break;
    if (layer.quantityRemaining <= 0) continue;
    const take = Math.min(layer.quantityRemaining, pending);
    const value =
      take === layer.quantityRemaining
        ? layer.valueRemainingCents
        : divideHalfUp(layer.valueRemainingCents * BigInt(take), BigInt(layer.quantityRemaining));
    consumed.push({ layerId: layer.id, quantityBaseUnits: take, valueCents: value });
    valueCents += value;
    pending -= take;
  }
  return { consumed, valueCents };
}

/**
 * Reparte un valor entre partes proporcionales a sus cantidades. Redondea sobre el acumulado
 * (no parte por parte): ninguna parte queda negativa y la suma es exacta.
 */
export function splitValue(valueCents: bigint, quantities: number[]): bigint[] {
  const total = quantities.reduce((sum, quantity) => sum + quantity, 0);
  if (total <= 0 || valueCents < 0n) {
    throw new InventoryDomainException('No hay cantidades para repartir el valor.');
  }
  let cumulative = 0;
  let assigned = 0n;
  return quantities.map((quantity) => {
    cumulative += quantity;
    const upTo = divideHalfUp(valueCents * BigInt(cumulative), BigInt(total));
    const part = upTo - assigned;
    assigned = upTo;
    return part;
  });
}
