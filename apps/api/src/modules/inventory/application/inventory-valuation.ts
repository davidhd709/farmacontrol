import { Prisma } from '@farmacia/database';
import {
  accountingPolicyAt,
  type EffectiveAccountingPolicy,
} from '../../company/application/accounting-policy.reader';
import { businessToday } from '../../../common/utils/business-date';
import {
  applyEntry,
  applyExit,
  divideHalfUp,
  unitCost,
  valueAtUnitCost,
  type CostBalance,
} from '../domain/services/weighted-average';
import { consumeLayers, splitValue, type CostLayer } from '../domain/services/cost-layers';
import {
  InvalidValuationLotsException,
  InventoryCostUnavailableException,
  InventoryValuationMismatchException,
} from '../domain/exceptions/inventory.exceptions';
import type { CostingMethod, OpeningCostSource } from '@farmacia/contracts';

type Tx = Prisma.TransactionClient;

export type ValuationMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'SALE_CANCELLATION'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

/** Unidades base del movimiento en una existencia física (lote, serie o saldo simple). */
export interface LotQuantity {
  lotId: string;
  quantityBaseUnits: number;
}

export interface ValuationMovementInput {
  productId: string;
  quantityBaseUnits: number;
  movementType: ValuationMovementType;
  sourceType: string;
  sourceId: string;
  userId?: string | null;
  /** Reparto por existencias; su suma es quantityBaseUnits (F5: PEPS y costo identificado) */
  lots: LotQuantity[];
}

interface LockedBalance {
  productName: string;
  balance: CostBalance;
  lastUnitCost: string | null;
  openingCostSource: OpeningCostSource;
  method: CostingMethod;
}

interface BalanceRow {
  quantity_base_units: number;
  total_value: Prisma.Decimal;
  last_unit_cost: Prisma.Decimal | null;
  costing_method: CostingMethod;
}

function toCents(value: Prisma.Decimal | string | number): bigint {
  const [whole, fraction = ''] = new Prisma.Decimal(value).toFixed(2).split('.');
  const negative = whole.startsWith('-');
  const cents = BigInt(whole.replace('-', '')) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

function centsToDecimal(cents: bigint): Prisma.Decimal {
  const abs = cents < 0n ? -cents : cents;
  return new Prisma.Decimal(
    `${cents < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`,
  );
}

/** Agrupa el reparto por existencia y comprueba que sume la cantidad del movimiento. */
function normalizeLots(input: ValuationMovementInput): LotQuantity[] {
  const byLot = new Map<string, number>();
  for (const lot of input.lots) {
    if (!Number.isSafeInteger(lot.quantityBaseUnits) || lot.quantityBaseUnits <= 0) {
      throw new InvalidValuationLotsException('cada existencia debe mover unidades positivas.');
    }
    byLot.set(lot.lotId, (byLot.get(lot.lotId) ?? 0) + lot.quantityBaseUnits);
  }
  const lots = [...byLot].map(([lotId, quantityBaseUnits]) => ({ lotId, quantityBaseUnits }));
  const total = lots.reduce((sum, lot) => sum + lot.quantityBaseUnits, 0);
  if (total !== input.quantityBaseUnits) {
    throw new InvalidValuationLotsException(
      `las existencias suman ${total} y el movimiento es de ${input.quantityBaseUnits}.`,
    );
  }
  return lots;
}

/**
 * Submayor de valoración del inventario (ADR-005 y ADR-006). FEFO o el orden físico deciden
 * qué existencia sale; aquí se decide a qué costo, según el método de la política vigente:
 * promedio ponderado móvil, PEPS por capas o costo identificado por existencia. Cada movimiento
 * físico se registra también aquí, en la misma transacción, después de cambiar las existencias.
 *
 * La primera vez que un producto se mueve se abre su saldo con las existencias que ya tenía.
 * Si la política cambia de método, el primer movimiento convierte el saldo del producto sin
 * cambiar su valor total. La cantidad valorizada debe coincidir con la suma de las existencias.
 */
export class InventoryValuation {
  /** Entrada con valor conocido: compra, anulación de venta o devolución de cliente. */
  async receive(tx: Tx, input: ValuationMovementInput & { valueCents: bigint }): Promise<bigint> {
    const lots = normalizeLots(input);
    const locked = await this.lock(tx, input, lots, 1);
    const balance = applyEntry(locked.balance, input.quantityBaseUnits, input.valueCents);
    if (locked.method !== 'WEIGHTED_AVERAGE') {
      await this.addLayers(tx, input, lots, input.valueCents);
    }
    await this.write(tx, input, 'IN', input.valueCents, balance, locked.lastUnitCost);
    return input.valueCents;
  }

  /** Entrada sin documento de costo (ajuste, existencia inicial) al costo vigente. */
  async receiveAtAverage(tx: Tx, input: ValuationMovementInput): Promise<bigint> {
    const lots = normalizeLots(input);
    const locked = await this.lock(tx, input, lots, 1);
    const { balance } = locked;
    let valueCents = 0n;
    if (locked.method === 'SPECIFIC_LOT') {
      // Costo identificado: al costo de la misma existencia si todavía tiene capas abiertas
      for (const lot of lots) {
        valueCents += await this.entryValueForLot(tx, input, locked, lot);
      }
    } else {
      valueCents = await this.averageEntryValue(tx, input, locked, input.quantityBaseUnits);
    }
    if (locked.method !== 'WEIGHTED_AVERAGE') {
      await this.addLayers(tx, input, lots, valueCents);
    }
    const after = applyEntry(balance, input.quantityBaseUnits, valueCents);
    await this.write(tx, input, 'IN', valueCents, after, locked.lastUnitCost);
    return valueCents;
  }

  /** Salida al costo del método vigente; devuelve el valor retirado. */
  async issue(tx: Tx, input: ValuationMovementInput): Promise<bigint> {
    const lots = normalizeLots(input);
    const locked = await this.lock(tx, input, lots, -1);
    if (locked.method === 'WEIGHTED_AVERAGE') {
      const { balance, valueCents } = applyExit(locked.balance, input.quantityBaseUnits);
      await this.write(tx, input, 'OUT', valueCents, balance, locked.lastUnitCost);
      return valueCents;
    }

    let valueCents = 0n;
    if (locked.method === 'FIFO') {
      // PEPS: las capas más antiguas del producto, sin importar de qué existencia salió
      valueCents = await this.consume(
        tx,
        await this.openLayers(tx, input.productId, null),
        input.quantityBaseUnits,
      );
    } else {
      for (const lot of lots) {
        valueCents += await this.consume(
          tx,
          await this.openLayers(tx, input.productId, lot.lotId),
          lot.quantityBaseUnits,
        );
      }
    }
    if (valueCents > locked.balance.valueCents) {
      throw new InventoryValuationMismatchException(
        locked.productName,
        locked.balance.quantityBaseUnits,
        locked.balance.quantityBaseUnits,
      );
    }
    const balance: CostBalance = {
      quantityBaseUnits: locked.balance.quantityBaseUnits - input.quantityBaseUnits,
      valueCents: locked.balance.valueCents - valueCents,
    };
    await this.write(tx, input, 'OUT', valueCents, balance, locked.lastUnitCost);
    return valueCents;
  }

  /**
   * Bloquea el saldo del producto, lo abre o lo convierte al método vigente y comprueba que,
   * después del cambio físico ya aplicado, la cantidad valorizada más el cambio coincida con
   * las existencias.
   */
  private async lock(
    tx: Tx,
    input: ValuationMovementInput,
    lots: LotQuantity[],
    direction: 1 | -1,
  ): Promise<LockedBalance> {
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { name: true },
    });
    if (!product) {
      throw new InventoryValuationMismatchException(input.productId, 0, 0);
    }
    const policy = await accountingPolicyAt(tx, businessToday());

    let row = await this.selectForUpdate(tx, input.productId);
    if (!row) {
      // Serializa la apertura: dos transacciones no pueden abrir el mismo producto
      await tx.$queryRaw`
        SELECT 1 AS locked
        FROM (SELECT pg_advisory_xact_lock(hashtext(${`valuation:${input.productId}`}))) AS l
      `;
      row = await this.selectForUpdate(tx, input.productId);
      if (!row) {
        await this.open(tx, input, lots, direction, product.name, policy);
        row = await this.selectForUpdate(tx, input.productId);
      }
    }
    if (row!.costing_method !== policy.costingMethod) {
      await this.convert(tx, input, lots, direction, product.name, row!, policy);
      row = await this.selectForUpdate(tx, input.productId);
    }
    const balance: CostBalance = {
      quantityBaseUnits: row!.quantity_base_units,
      valueCents: toCents(row!.total_value),
    };
    const signedQuantity = direction * input.quantityBaseUnits;
    const physical = await this.physicalQuantity(tx, input.productId);
    if (physical !== balance.quantityBaseUnits + signedQuantity) {
      throw new InventoryValuationMismatchException(
        product.name,
        physical,
        balance.quantityBaseUnits + signedQuantity,
      );
    }
    return {
      productName: product.name,
      balance,
      lastUnitCost: row!.last_unit_cost === null ? null : String(row!.last_unit_cost),
      openingCostSource: policy.openingCostSource,
      method: policy.costingMethod,
    };
  }

  private async selectForUpdate(tx: Tx, productId: string): Promise<BalanceRow | null> {
    const rows = await tx.$queryRaw<BalanceRow[]>`
      SELECT quantity_base_units, total_value, last_unit_cost, costing_method
      FROM inventory_cost_balances
      WHERE product_id = ${productId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async physicalQuantity(tx: Tx, productId: string): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ quantity: number }>>`
      SELECT COALESCE(SUM(current_quantity), 0)::int AS quantity
      FROM inventory_lots
      WHERE product_id = ${productId}::uuid
    `;
    return rows[0]?.quantity ?? 0;
  }

  /**
   * Existencias del producto antes del movimiento en curso (que ya cambió los lotes), en
   * orden de entrada. Son la base de la apertura y de la conversión de método.
   */
  private async lotsBeforeMovement(
    tx: Tx,
    productId: string,
    lots: LotQuantity[],
    direction: 1 | -1,
  ): Promise<LotQuantity[]> {
    const rows = await tx.$queryRaw<Array<{ id: string; current_quantity: number }>>`
      SELECT id, current_quantity
      FROM inventory_lots
      WHERE product_id = ${productId}::uuid
      ORDER BY created_at ASC, id ASC
    `;
    const change = new Map(lots.map((lot) => [lot.lotId, direction * lot.quantityBaseUnits]));
    return rows
      .map((row) => ({
        lotId: row.id,
        quantityBaseUnits: row.current_quantity - (change.get(row.id) ?? 0),
      }))
      .filter((lot) => lot.quantityBaseUnits > 0);
  }

  /** Apertura con las existencias previas al movimiento que la provoca (ADR-005). */
  private async open(
    tx: Tx,
    input: ValuationMovementInput,
    lots: LotQuantity[],
    direction: 1 | -1,
    productName: string,
    policy: EffectiveAccountingPolicy,
  ): Promise<void> {
    const openingLots = await this.lotsBeforeMovement(tx, input.productId, lots, direction);
    const openingQuantity = openingLots.reduce((sum, lot) => sum + lot.quantityBaseUnits, 0);
    const physicalBefore =
      (await this.physicalQuantity(tx, input.productId)) - direction * input.quantityBaseUnits;
    if (physicalBefore < 0 || physicalBefore !== openingQuantity) {
      throw new InventoryValuationMismatchException(productName, physicalBefore, openingQuantity);
    }
    const excludePurchaseId = input.sourceType === 'PURCHASE' ? input.sourceId : null;
    let cost = await this.openingUnitCost(
      tx,
      input.productId,
      excludePurchaseId,
      policy.openingCostSource,
    );
    // Sin otra referencia, la propia compra que entra es el último costo de compra conocido
    if (!cost && excludePurchaseId) {
      cost = await this.openingUnitCost(tx, input.productId, null, policy.openingCostSource);
    }
    if (openingQuantity > 0 && !cost) {
      throw new InventoryCostUnavailableException(productName);
    }
    const valueCents = openingQuantity > 0 ? valueAtUnitCost(cost!, openingQuantity) : 0n;
    await tx.inventoryCostBalance.create({
      data: {
        productId: input.productId,
        quantityBaseUnits: openingQuantity,
        totalValue: centsToDecimal(valueCents),
        lastUnitCost: cost ? new Prisma.Decimal(cost) : null,
        costingMethod: policy.costingMethod,
      },
    });
    if (openingQuantity > 0) {
      await tx.inventoryValuationMovement.create({
        data: {
          productId: input.productId,
          movementType: 'OPENING',
          direction: 'IN',
          quantityBaseUnits: openingQuantity,
          value: centsToDecimal(valueCents),
          balanceQuantityAfter: openingQuantity,
          balanceValueAfter: centsToDecimal(valueCents),
          sourceType: 'AUTO_OPENING',
          sourceId: `${input.sourceType}:${input.sourceId}`.slice(0, 128),
          createdByUserId: input.userId ?? null,
        },
      });
      if (policy.costingMethod !== 'WEIGHTED_AVERAGE') {
        await this.createLayers(tx, input.productId, openingLots, valueCents, {
          sourceType: 'AUTO_OPENING',
          sourceId: `${input.sourceType}:${input.sourceId}`,
        });
      }
    }
  }

  /**
   * Conversión del saldo del producto al método de la política vigente (ADR-006, F5). El
   * valor total no cambia: las capas nuevas reparten el saldo al costo promedio vigente.
   */
  private async convert(
    tx: Tx,
    input: ValuationMovementInput,
    lots: LotQuantity[],
    direction: 1 | -1,
    productName: string,
    row: BalanceRow,
    policy: EffectiveAccountingPolicy,
  ): Promise<void> {
    const quantity = row.quantity_base_units;
    const valueCents = toCents(row.total_value);
    await tx.inventoryCostLayer.updateMany({
      where: { productId: input.productId, quantityRemaining: { gt: 0 } },
      data: { quantityRemaining: 0, valueRemaining: new Prisma.Decimal(0) },
    });
    if (policy.costingMethod !== 'WEIGHTED_AVERAGE' && quantity > 0) {
      const currentLots = await this.lotsBeforeMovement(tx, input.productId, lots, direction);
      const lotsTotal = currentLots.reduce((sum, lot) => sum + lot.quantityBaseUnits, 0);
      if (lotsTotal !== quantity) {
        throw new InventoryValuationMismatchException(productName, lotsTotal, quantity);
      }
      await this.createLayers(tx, input.productId, currentLots, valueCents, {
        sourceType: 'METHOD_CHANGE',
        sourceId: policy.id ?? 'DEFAULT_POLICY',
      });
    }
    await tx.inventoryCostingConversion.create({
      data: {
        productId: input.productId,
        fromMethod: row.costing_method,
        toMethod: policy.costingMethod,
        quantityBaseUnits: quantity,
        totalValue: centsToDecimal(valueCents),
        policyId: policy.id,
        createdByUserId: input.userId ?? null,
      },
    });
    await tx.inventoryCostBalance.update({
      where: { productId: input.productId },
      data: { costingMethod: policy.costingMethod },
    });
  }

  /** Capas de una entrada, repartiendo su valor entre las existencias que la reciben. */
  private async addLayers(
    tx: Tx,
    input: ValuationMovementInput,
    lots: LotQuantity[],
    valueCents: bigint,
  ): Promise<void> {
    await this.createLayers(tx, input.productId, lots, valueCents, {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
  }

  private async createLayers(
    tx: Tx,
    productId: string,
    lots: LotQuantity[],
    valueCents: bigint,
    source: { sourceType: string; sourceId: string },
  ): Promise<void> {
    const values = splitValue(
      valueCents,
      lots.map((lot) => lot.quantityBaseUnits),
    );
    await tx.inventoryCostLayer.createMany({
      data: lots.map((lot, index) => ({
        productId,
        lotId: lot.lotId,
        quantityInitial: lot.quantityBaseUnits,
        quantityRemaining: lot.quantityBaseUnits,
        valueInitial: centsToDecimal(values[index]),
        valueRemaining: centsToDecimal(values[index]),
        sourceType: source.sourceType,
        sourceId: source.sourceId.slice(0, 128),
      })),
    });
  }

  /** Capas abiertas en orden de entrada: del producto (PEPS) o de una existencia. */
  private async openLayers(tx: Tx, productId: string, lotId: string | null): Promise<CostLayer[]> {
    const rows = await tx.inventoryCostLayer.findMany({
      where: { productId, quantityRemaining: { gt: 0 }, ...(lotId ? { lotId } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, quantityRemaining: true, valueRemaining: true },
    });
    return rows.map((row) => ({
      id: row.id,
      quantityRemaining: row.quantityRemaining,
      valueRemainingCents: toCents(row.valueRemaining),
    }));
  }

  private async consume(tx: Tx, layers: CostLayer[], quantityBaseUnits: number): Promise<bigint> {
    const { consumed, valueCents } = consumeLayers(layers, quantityBaseUnits);
    const byId = new Map(layers.map((layer) => [layer.id, layer]));
    for (const part of consumed) {
      const layer = byId.get(part.layerId)!;
      await tx.inventoryCostLayer.update({
        where: { id: part.layerId },
        data: {
          quantityRemaining: layer.quantityRemaining - part.quantityBaseUnits,
          valueRemaining: centsToDecimal(layer.valueRemainingCents - part.valueCents),
        },
      });
    }
    return valueCents;
  }

  /** Valor de una entrada sin documento al promedio del producto o al último costo conocido. */
  private async averageEntryValue(
    tx: Tx,
    input: ValuationMovementInput,
    locked: LockedBalance,
    quantityBaseUnits: number,
  ): Promise<bigint> {
    const { balance, lastUnitCost } = locked;
    if (balance.quantityBaseUnits > 0) {
      return divideHalfUp(
        balance.valueCents * BigInt(quantityBaseUnits),
        BigInt(balance.quantityBaseUnits),
      );
    }
    const cost =
      lastUnitCost ??
      (await this.openingUnitCost(tx, input.productId, null, locked.openingCostSource));
    if (!cost) throw new InventoryCostUnavailableException(locked.productName);
    return valueAtUnitCost(cost, quantityBaseUnits);
  }

  /** Costo identificado: promedio de las capas abiertas de la existencia o, si no tiene, del producto. */
  private async entryValueForLot(
    tx: Tx,
    input: ValuationMovementInput,
    locked: LockedBalance,
    lot: LotQuantity,
  ): Promise<bigint> {
    const layers = await this.openLayers(tx, input.productId, lot.lotId);
    const quantity = layers.reduce((sum, layer) => sum + layer.quantityRemaining, 0);
    if (quantity > 0) {
      const value = layers.reduce((sum, layer) => sum + layer.valueRemainingCents, 0n);
      return divideHalfUp(value * BigInt(lot.quantityBaseUnits), BigInt(quantity));
    }
    return this.averageEntryValue(tx, input, locked, lot.quantityBaseUnits);
  }

  /** Último costo de compra por unidad base o, si no hay compras, el costo del catálogo. */
  private async openingUnitCost(
    tx: Tx,
    productId: string,
    excludePurchaseId: string | null,
    openingCostSource: OpeningCostSource,
  ): Promise<string | null> {
    // La empresa decide si la apertura toma el último costo de compra o el del catálogo
    const lastPurchase =
      openingCostSource === 'CATALOG'
        ? null
        : await tx.purchaseLine.findFirst({
            where: {
              productId,
              quantityBaseUnits: { gt: 0 },
              ...(excludePurchaseId ? { purchaseId: { not: excludePurchaseId } } : {}),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { subtotal: true, quantityBaseUnits: true },
          });
    if (lastPurchase && toCents(lastPurchase.subtotal) > 0n) {
      return unitCost(toCents(lastPurchase.subtotal), lastPurchase.quantityBaseUnits);
    }
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { baseCost: true },
    });
    if (product && toCents(product.baseCost) > 0n) {
      return new Prisma.Decimal(product.baseCost).toFixed(6);
    }
    return null;
  }

  private async write(
    tx: Tx,
    input: ValuationMovementInput,
    direction: 'IN' | 'OUT',
    valueCents: bigint,
    after: CostBalance,
    previousUnitCost: string | null,
  ): Promise<void> {
    const lastUnitCost =
      after.quantityBaseUnits > 0
        ? unitCost(after.valueCents, after.quantityBaseUnits)
        : direction === 'OUT' && valueCents > 0n
          ? unitCost(valueCents, input.quantityBaseUnits)
          : previousUnitCost;
    await tx.inventoryCostBalance.update({
      where: { productId: input.productId },
      data: {
        quantityBaseUnits: after.quantityBaseUnits,
        totalValue: centsToDecimal(after.valueCents),
        lastUnitCost: lastUnitCost === null ? null : new Prisma.Decimal(lastUnitCost),
      },
    });
    await tx.inventoryValuationMovement.create({
      data: {
        productId: input.productId,
        movementType: input.movementType,
        direction,
        quantityBaseUnits: input.quantityBaseUnits,
        value: centsToDecimal(valueCents),
        balanceQuantityAfter: after.quantityBaseUnits,
        balanceValueAfter: centsToDecimal(after.valueCents),
        sourceType: input.sourceType,
        sourceId: input.sourceId.slice(0, 128),
        createdByUserId: input.userId ?? null,
      },
    });
  }
}
