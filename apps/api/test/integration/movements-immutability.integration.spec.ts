import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase, Prisma } from '@farmacia/database';

/**
 * Kardex y caja son libros de solo inserción: los movimientos confirmados no se
 * modifican ni se borran, y el kardex solo admite tipos de movimiento conocidos.
 */
describe('Inmutabilidad de movimientos de inventario y caja (PostgreSQL real)', () => {
  let productId: string;
  let lotId: string;
  let userId: string;

  beforeEach(async () => {
    await cleanTestDatabase();
    const user = await prisma.user.create({
      data: { username: 'inmutable', passwordHash: 'x', isActive: true },
    });
    userId = user.id;
    const location = await prisma.location.create({
      data: { code: 'INM-01', name: 'Estante', isDefault: true },
    });
    const category = await prisma.category.create({ data: { name: 'Inmutables' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'INM-001',
        name: 'Producto inmutable',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('100.00'),
        baseCost: new Prisma.Decimal('50.00'),
      },
    });
    productId = product.id;
    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId: location.id,
        lotNumber: 'LOT-INM',
        expirationDate: new Date('2030-01-31'),
        currentQuantity: 5,
      },
    });
    lotId = lot.id;
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  function createInventoryMovement(movementType: string) {
    return prisma.inventoryMovement.create({
      data: {
        movementType,
        productId,
        lotId,
        quantityBaseUnits: 5,
        presentationFactorHistorical: 1,
        balanceAfterBaseUnits: 5,
        referenceDocumentType: 'LOTE_INICIAL',
        referenceDocumentId: lotId,
      },
    });
  }

  it('impide modificar o borrar un movimiento de kardex', async () => {
    const movement = await createInventoryMovement('AJUSTE_POSITIVO');

    await expect(
      prisma.inventoryMovement.update({
        where: { id: movement.id },
        data: { quantityBaseUnits: 50 },
      }),
    ).rejects.toThrow(/inmutable/);
    await expect(prisma.inventoryMovement.delete({ where: { id: movement.id } })).rejects.toThrow(
      /inmutable/,
    );

    const reloaded = await prisma.inventoryMovement.findUniqueOrThrow({
      where: { id: movement.id },
    });
    expect(reloaded.quantityBaseUnits).toBe(5);
  });

  it('impide modificar o borrar un movimiento de caja', async () => {
    const movement = await prisma.cashMovement.create({
      data: {
        movementType: 'INGRESO_MANUAL',
        amount: new Prisma.Decimal('1000.00'),
        paymentMethod: 'EFECTIVO',
        reason: 'Base',
        balanceAfter: new Prisma.Decimal('1000.00'),
        createdByUserId: userId,
      },
    });

    await expect(
      prisma.cashMovement.update({
        where: { id: movement.id },
        data: { amount: new Prisma.Decimal('1.00') },
      }),
    ).rejects.toThrow(/inmutable/);
    await expect(prisma.cashMovement.delete({ where: { id: movement.id } })).rejects.toThrow(
      /inmutable/,
    );
  });

  it('rechaza tipos de movimiento de kardex desconocidos', async () => {
    await expect(createInventoryMovement('VENTA_MISTERIOSA')).rejects.toThrow(
      /inventory_movements_movement_type_check/,
    );
    await expect(createInventoryMovement('ENTRADA_DEVOLUCION_VENTA')).resolves.toBeDefined();
    await expect(createInventoryMovement('SALIDA_DEVOLUCION_COMPRA')).resolves.toBeDefined();
  });
});
