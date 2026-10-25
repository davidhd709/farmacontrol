import { InventoryDomainException } from '../exceptions/inventory.exceptions';

/**
 * Promedio ponderado móvil (ADR-005) en unidades base y centavos exactos. El costo promedio
 * es valueCents / quantityBaseUnits; nunca se guarda redondeado, así la suma de los
 * movimientos coincide siempre con el saldo y la última salida se lleva el valor restante.
 */
export interface CostBalance {
  quantityBaseUnits: number;
  valueCents: bigint;
}

function assertQuantity(quantityBaseUnits: number): void {
  if (!Number.isSafeInteger(quantityBaseUnits) || quantityBaseUnits <= 0) {
    throw new InventoryDomainException(
      'La cantidad valorizada debe ser un entero positivo de unidades base.',
    );
  }
}

/** División con redondeo half-up para numerador y divisor no negativos. */
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Valor de una salida al costo promedio vigente. */
export function exitValue(balance: CostBalance, quantityBaseUnits: number): bigint {
  assertQuantity(quantityBaseUnits);
  if (quantityBaseUnits > balance.quantityBaseUnits) {
    throw new InventoryDomainException(
      `El inventario valorizado tiene ${balance.quantityBaseUnits} unidades base y se intentó retirar ${quantityBaseUnits}.`,
      'conflict',
    );
  }
  if (quantityBaseUnits === balance.quantityBaseUnits) return balance.valueCents;
  return divideHalfUp(
    balance.valueCents * BigInt(quantityBaseUnits),
    BigInt(balance.quantityBaseUnits),
  );
}

export function applyEntry(
  balance: CostBalance,
  quantityBaseUnits: number,
  valueCents: bigint,
): CostBalance {
  assertQuantity(quantityBaseUnits);
  if (valueCents < 0n) {
    throw new InventoryDomainException('El valor de una entrada no puede ser negativo.');
  }
  return {
    quantityBaseUnits: balance.quantityBaseUnits + quantityBaseUnits,
    valueCents: balance.valueCents + valueCents,
  };
}

export function applyExit(
  balance: CostBalance,
  quantityBaseUnits: number,
): { balance: CostBalance; valueCents: bigint } {
  const valueCents = exitValue(balance, quantityBaseUnits);
  return {
    valueCents,
    balance: {
      quantityBaseUnits: balance.quantityBaseUnits - quantityBaseUnits,
      valueCents: balance.valueCents - valueCents,
    },
  };
}

/** Costo unitario con seis decimales, para mostrar y para valorar entradas sin existencias. */
export function unitCost(valueCents: bigint, quantityBaseUnits: number): string {
  assertQuantity(quantityBaseUnits);
  const micro = divideHalfUp(valueCents * 10_000n, BigInt(quantityBaseUnits));
  return `${micro / 1_000_000n}.${(micro % 1_000_000n).toString().padStart(6, '0')}`;
}

/** Valor de una cantidad a un costo unitario con hasta seis decimales. */
export function valueAtUnitCost(unitCostText: string, quantityBaseUnits: number): bigint {
  assertQuantity(quantityBaseUnits);
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(unitCostText);
  if (!match) {
    throw new InventoryDomainException(`Costo unitario inválido: ${unitCostText}.`);
  }
  const micro = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'));
  return divideHalfUp(micro * BigInt(quantityBaseUnits), 10_000n);
}
