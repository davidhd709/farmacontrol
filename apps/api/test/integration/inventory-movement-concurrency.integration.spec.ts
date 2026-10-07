import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase, Prisma } from '@farmacia/database';
import { PrismaInventoryMovementRepository } from '../../src/modules/inventory/infrastructure/adapters/prisma-inventory-movement.repository';

/**
 * AUD-001: recordMovement debe serializar los cambios de saldo sobre un mismo lote.
 * Sin bloqueo de fila, dos ajustes concurrentes leen el mismo saldo y uno de ellos se pierde.
 */
describe('Movimientos de inventario concurrentes sobre un mismo lote (PostgreSQL real)', () => {
  const repository = new PrismaInventoryMovementRepository();
  let productId: string;
  let lotId: string;

  beforeEach(async () => {
    await cleanTestDatabase();

    const location = await prisma.location.create({
      data: { code: 'AJ-CONC', name: 'Estante Ajustes', isDefault: true },
    });
    const category = await prisma.category.create({
      data: { name: 'Analgésicos', description: 'Prueba de ajustes concurrentes' },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'ACE-500-AJ',
        name: 'Acetaminofén 500mg Ajustes',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('500.00'),
        baseCost: new Prisma.Decimal('200.00'),
        requiresLotControl: true,
      },
    });
    productId = product.id;

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 90);
    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId: location.id,
        lotNumber: 'LOT-AJ-CONC',
        currentQuantity: 100,
        expirationDate,
        isActive: true,
      },
    });
    lotId = lot.id;
  }, 30000);

  afterAll(async () => {
    await cleanTestDatabase();
  });

  it('no pierde ajustes concurrentes: el saldo final es la suma exacta y el kardex queda encadenado', async () => {
    const deltas = [5, -3, 7, -2, 4, -6, 8, -1, 3, -5];

    const results = await Promise.allSettled(
      deltas.map((delta) =>
        repository.recordMovement({
          movementType: delta > 0 ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
          productId,
          lotId,
          quantityBaseUnits: delta,
          referenceDocumentType: 'AJUSTE_MANUAL',
          notes: 'Ajuste concurrente',
        }),
      ),
    );

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const expected = 100 + deltas.reduce((sum, d) => sum + d, 0);
    const lot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } });
    expect(lot.currentQuantity).toBe(expected);

    // El kardex forma una cadena: los saldos previos de cada movimiento son exactamente
    // el saldo inicial más los saldos posteriores, excepto el saldo final.
    const movements = await prisma.inventoryMovement.findMany({ where: { lotId } });
    expect(movements).toHaveLength(deltas.length);

    const sortNumbers = (values: number[]) => [...values].sort((a, b) => a - b);
    const balancesBefore = movements.map((m) => m.balanceAfterBaseUnits - m.quantityBaseUnits);
    const balancesAfter = movements.map((m) => m.balanceAfterBaseUnits);
    const chainStarts = [100, ...balancesAfter];
    chainStarts.splice(chainStarts.indexOf(expected), 1);
    expect(sortNumbers(balancesBefore)).toEqual(sortNumbers(chainStarts));
  }, 30000);

  it('rechaza un ajuste que dejaría el lote en negativo sin alterar el saldo', async () => {
    await expect(
      repository.recordMovement({
        movementType: 'AJUSTE_NEGATIVO',
        productId,
        lotId,
        quantityBaseUnits: -101,
        referenceDocumentType: 'AJUSTE_MANUAL',
      }),
    ).rejects.toThrow(/Inventario insuficiente/);

    const lot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotId } });
    expect(lot.currentQuantity).toBe(100);
    expect(await prisma.inventoryMovement.count({ where: { lotId } })).toBe(0);
  }, 30000);
});
