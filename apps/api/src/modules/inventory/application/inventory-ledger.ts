import { Injectable } from '@nestjs/common';
import { Prisma } from '@farmacia/database';

type Tx = Prisma.TransactionClient;

/** Movimiento de kardex inmutable que acompaña a todo cambio de existencias. */
export interface KardexEntry {
  movementType: string;
  productId: string;
  presentationId?: string | null;
  quantityBaseUnits: number;
  presentationFactorHistorical: number;
  quantityCommercial?: Prisma.Decimal;
  referenceDocumentType: string;
  referenceDocumentId: string;
  notes: string;
  createdByUserId: string | null;
}

export interface LockedLot {
  id: string;
  lot_number: string;
  expiration_date: Date;
  current_quantity: number;
  is_active: boolean;
}

/** Consulta común: ambos flujos deben considerar exactamente los mismos lotes y orden. */
function fefoCandidatesQuery(productId: string, businessDay: string): Prisma.Sql {
  return Prisma.sql`
    SELECT id, lot_number, expiration_date, current_quantity, is_active
    FROM inventory_lots
    WHERE product_id = ${productId}::uuid
      AND is_active = true
      AND current_quantity > 0
      AND expiration_date >= ${businessDay}::date
    ORDER BY expiration_date ASC, created_at ASC
  `;
}

/**
 * Contrato transaccional de inventario para otros módulos (ventas, notas, compras).
 * Es la única vía para tocar lotes y kardex desde fuera del módulo: siempre dentro de
 * la transacción del llamador y dejando el movimiento con el saldo resultante.
 */
@Injectable()
export class InventoryLedger {
  /**
   * Lotes vendibles de un producto bloqueados en orden FEFO: activos, con existencias y
   * con vencimiento igual o posterior al día de negocio indicado.
   */
  async lockFefoCandidates(tx: Tx, productId: string, businessDay: string): Promise<LockedLot[]> {
    return tx.$queryRaw<LockedLot[]>(
      Prisma.sql`${fefoCandidatesQuery(productId, businessDay)} FOR UPDATE`,
    );
  }

  /** Consulta de sólo lectura, sin bloqueo ni reserva de los lotes disponibles. */
  async listFefoCandidates(
    client: Tx,
    productId: string,
    businessDay: string,
  ): Promise<LockedLot[]> {
    return client.$queryRaw<LockedLot[]>(fefoCandidatesQuery(productId, businessDay));
  }

  /** Bloquea un lote por id; null si no existe. */
  async lockLot(tx: Tx, lotId: string): Promise<LockedLot | null> {
    const rows = await tx.$queryRaw<LockedLot[]>`
      SELECT id, lot_number, expiration_date, current_quantity, is_active
      FROM inventory_lots
      WHERE id = ${lotId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Bloquea el lote de un producto en una ubicación por número de lote; null si no existe. */
  async lockLotByNumber(
    tx: Tx,
    params: { productId: string; locationId: string; lotNumber: string },
  ): Promise<LockedLot | null> {
    const rows = await tx.$queryRaw<LockedLot[]>`
      SELECT id, lot_number, expiration_date, current_quantity, is_active
      FROM inventory_lots
      WHERE product_id = ${params.productId}::uuid
        AND location_id = ${params.locationId}::uuid
        AND lot_number = ${params.lotNumber}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /**
   * Suma (positivo) o resta (negativo) unidades base a un lote y registra el kardex con
   * el saldo resultante. Devuelve ese saldo.
   */
  async changeLotQuantity(
    tx: Tx,
    lotId: string,
    change: number,
    entry: KardexEntry,
  ): Promise<number> {
    const updated = await tx.inventoryLot.update({
      where: { id: lotId },
      data: {
        currentQuantity: change >= 0 ? { increment: change } : { decrement: -change },
      },
    });
    await this.recordMovement(tx, lotId, updated.currentQuantity, entry);
    return updated.currentQuantity;
  }

  /** Crea un lote nuevo con su existencia inicial (sin kardex: lo registra el llamador). */
  async createLot(
    tx: Tx,
    data: {
      id: string;
      productId: string;
      locationId: string;
      lotNumber: string;
      expirationDate: Date;
      currentQuantity: number;
    },
  ): Promise<string> {
    const lot = await tx.inventoryLot.create({ data: { ...data, isActive: true } });
    return lot.id;
  }

  /** Registra un movimiento de kardex inmutable con el saldo del lote tras el cambio. */
  async recordMovement(
    tx: Tx,
    lotId: string,
    balanceAfterBaseUnits: number,
    entry: KardexEntry,
  ): Promise<void> {
    await tx.inventoryMovement.create({
      data: {
        movementType: entry.movementType,
        productId: entry.productId,
        lotId,
        presentationId: entry.presentationId || null,
        quantityBaseUnits: entry.quantityBaseUnits,
        presentationFactorHistorical: entry.presentationFactorHistorical,
        ...(entry.quantityCommercial !== undefined
          ? { quantityCommercial: entry.quantityCommercial }
          : {}),
        balanceAfterBaseUnits,
        referenceDocumentType: entry.referenceDocumentType,
        referenceDocumentId: entry.referenceDocumentId,
        notes: entry.notes,
        createdByUserId: entry.createdByUserId,
      },
    });
  }
}
