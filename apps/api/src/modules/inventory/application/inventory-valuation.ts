import { Prisma } from '@farmacia/database';
import { accountingPolicyAt } from '../../company/application/accounting-policy.reader';
import { businessToday } from '../../../common/utils/business-date';
import {
  applyEntry,
  applyExit,
  divideHalfUp,
  unitCost,
  valueAtUnitCost,
  type CostBalance,
} from '../domain/services/weighted-average';
import {
  CostingMethodNotAvailableException,
  InventoryCostUnavailableException,
  InventoryValuationMismatchException,
} from '../domain/exceptions/inventory.exceptions';
import type { OpeningCostSource } from '@farmacia/contracts';

type Tx = Prisma.TransactionClient;

export type ValuationMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'SALE_CANCELLATION'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

export interface ValuationMovementInput {
  productId: string;
  quantityBaseUnits: number;
  movementType: ValuationMovementType;
  sourceType: string;
  sourceId: string;
  userId?: string | null;
}

interface LockedBalance {
  productName: string;
  balance: CostBalance;
  lastUnitCost: string | null;
  openingCostSource: OpeningCostSource;
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

/**
 * Submayor de valoración del inventario con promedio ponderado móvil (ADR-005). FEFO decide
 * qué lote sale; aquí se decide a qué costo. Cada movimiento físico de existencias se
 * registra también aquí, dentro de la misma transacción, después de cambiar los lotes.
 *
 * La primera vez que un producto se mueve se abre su saldo con las existencias que ya tenía,
 * al último costo de compra o, si no tiene compras, al costo del catálogo. Desde entonces la
 * cantidad valorizada debe coincidir con la suma de sus lotes o la operación se detiene.
 */
export class InventoryValuation {
  /** Entrada con valor conocido: compra, anulación de venta o devolución de cliente. */
  async receive(tx: Tx, input: ValuationMovementInput & { valueCents: bigint }): Promise<bigint> {
    const locked = await this.lock(tx, input, input.quantityBaseUnits);
    const balance = applyEntry(locked.balance, input.quantityBaseUnits, input.valueCents);
    await this.write(tx, input, 'IN', input.valueCents, balance, locked.lastUnitCost);
    return input.valueCents;
  }

  /** Entrada sin documento de costo (ajuste, existencia inicial de un lote) al promedio vigente. */
  async receiveAtAverage(tx: Tx, input: ValuationMovementInput): Promise<bigint> {
    const locked = await this.lock(tx, input, input.quantityBaseUnits);
    const { balance, lastUnitCost } = locked;
    let valueCents: bigint;
    if (balance.quantityBaseUnits > 0) {
      valueCents = divideHalfUp(
        balance.valueCents * BigInt(input.quantityBaseUnits),
        BigInt(balance.quantityBaseUnits),
      );
    } else {
      const cost =
        lastUnitCost ??
        (await this.openingUnitCost(tx, input.productId, null, locked.openingCostSource));
      if (!cost) throw new InventoryCostUnavailableException(locked.productName);
      valueCents = valueAtUnitCost(cost, input.quantityBaseUnits);
    }
    const after = applyEntry(balance, input.quantityBaseUnits, valueCents);
    await this.write(tx, input, 'IN', valueCents, after, lastUnitCost);
    return valueCents;
  }

  /** Salida al costo promedio vigente; devuelve el valor retirado. */
  async issue(tx: Tx, input: ValuationMovementInput): Promise<bigint> {
    const locked = await this.lock(tx, input, -input.quantityBaseUnits);
    const { balance, valueCents } = applyExit(locked.balance, input.quantityBaseUnits);
    await this.write(tx, input, 'OUT', valueCents, balance, locked.lastUnitCost);
    return valueCents;
  }

  /**
   * Bloquea el saldo del producto y comprueba que, después del cambio físico ya aplicado en
   * los lotes, la cantidad valorizada más el cambio coincida con las existencias.
   */
  private async lock(
    tx: Tx,
    input: ValuationMovementInput,
    signedQuantity: number,
  ): Promise<LockedBalance> {
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { name: true },
    });
    if (!product) {
      throw new InventoryValuationMismatchException(input.productId, 0, 0);
    }
    // ADR-006: la empresa elige el método; aquí solo se aplica el que está implementado
    const policy = await accountingPolicyAt(tx, businessToday());
    if (policy.costingMethod !== 'WEIGHTED_AVERAGE') {
      throw new CostingMethodNotAvailableException(policy.costingMethod);
    }

    let row = await this.selectForUpdate(tx, input.productId);
    if (!row) {
      // Serializa la apertura: dos transacciones no pueden abrir el mismo producto
      await tx.$queryRaw`
        SELECT 1 AS locked
        FROM (SELECT pg_advisory_xact_lock(hashtext(${`valuation:${input.productId}`}))) AS l
      `;
      row = await this.selectForUpdate(tx, input.productId);
      if (!row) {
        await this.open(tx, input, product.name, signedQuantity, policy.openingCostSource);
        row = await this.selectForUpdate(tx, input.productId);
      }
    }
    const balance: CostBalance = {
      quantityBaseUnits: row!.quantity_base_units,
      valueCents: toCents(row!.total_value),
    };
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
    };
  }

  private async selectForUpdate(tx: Tx, productId: string) {
    const rows = await tx.$queryRaw<
      Array<{
        quantity_base_units: number;
        total_value: Prisma.Decimal;
        last_unit_cost: Prisma.Decimal | null;
      }>
    >`
      SELECT quantity_base_units, total_value, last_unit_cost
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

  /** Apertura con las existencias previas al movimiento que la provoca (ADR-005). */
  private async open(
    tx: Tx,
    input: ValuationMovementInput,
    productName: string,
    signedQuantity: number,
    openingCostSource: OpeningCostSource,
  ): Promise<void> {
    const openingQuantity = (await this.physicalQuantity(tx, input.productId)) - signedQuantity;
    if (openingQuantity < 0) {
      throw new InventoryValuationMismatchException(productName, openingQuantity, 0);
    }
    const excludePurchaseId = input.sourceType === 'PURCHASE' ? input.sourceId : null;
    let cost = await this.openingUnitCost(
      tx,
      input.productId,
      excludePurchaseId,
      openingCostSource,
    );
    // Sin otra referencia, la propia compra que entra es el último costo de compra conocido
    if (!cost && excludePurchaseId) {
      cost = await this.openingUnitCost(tx, input.productId, null, openingCostSource);
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
    }
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
