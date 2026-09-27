import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma, cleanTestDatabase } from '../src';

describe('Motor FEFO con Bloqueo Concurrente en PostgreSQL Real (Integration & Concurrency)', () => {
  beforeAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  });

  it('debe serializar ordenadamente 10 peticiones concurrentes simultáneas sobre el mismo lote sin saldo negativo ni duplicación', async () => {
    const category = await prisma.category.create({
      data: { name: 'Analgésicos Especiales' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'TRAM-50',
        name: 'Tramadol 50mg',
        baseUnit: 'CÁPSULA',
        basePrice: new Prisma.Decimal('2500.00'),
      },
    });

    const location = await prisma.location.create({
      data: { code: 'BOD-FEFO-TEST', name: 'Bodega FEFO Concurrente' },
    });

    // Creamos un único lote con exactamente 50 unidades
    const lot = await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        lotNumber: 'LT-CONC-50',
        expirationDate: new Date('2029-01-01'),
        currentQuantity: 50,
      },
    });

    // Función que simula la transacción FEFO con SELECT FOR UPDATE
    const simulateFefoSale = async (amount: number, saleIndex: number) => {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string; current_quantity: number }>
        >`
          SELECT id, current_quantity
          FROM inventory_lots
          WHERE id = ${lot.id}::uuid
            AND current_quantity >= ${amount}
          FOR UPDATE
        `;

        if (rows.length === 0) {
          throw new Error('Stock insuficiente');
        }

        const newQty = rows[0].current_quantity - amount;

        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: { currentQuantity: newQty },
        });

        await tx.inventoryMovement.create({
          data: {
            movementType: 'SALIDA_VENTA',
            productId: product.id,
            lotId: lot.id,
            quantityBaseUnits: -amount,
            balanceAfterBaseUnits: newQty,
            referenceDocumentType: 'VENTA',
            referenceDocumentId: `VENTA-CONC-${saleIndex}`,
          },
        });

        return { success: true, newQty };
      });
    };

    // Lanzamos 10 ventas simultáneas de 10 unidades cada una (Demanda total: 100 unidades; Disponibilidad real: 50 unidades)
    const promises = Array.from({ length: 10 }).map((_, index) =>
      simulateFefoSale(10, index).catch((err) => ({
        success: false,
        error: err.message,
      })),
    );

    const results = await Promise.all(promises);

    const successfulSales = results.filter((r) => r.success);
    const rejectedSales = results.filter((r) => !r.success);

    // Exactamente 5 deben tener éxito (5 * 10 = 50 unidades físicas) y exactamente 5 deben fallar por falta de existencias
    expect(successfulSales).toHaveLength(5);
    expect(rejectedSales).toHaveLength(5);

    // Verificamos el saldo final en la base de datos: debe ser exactamente 0, NUNCA negativo
    const finalLot = await prisma.inventoryLot.findUnique({
      where: { id: lot.id },
    });
    expect(finalLot?.currentQuantity).toBe(0);

    // Verificamos que se hayan registrado exactamente 5 movimientos en el Kardex
    const movementsCount = await prisma.inventoryMovement.count({
      where: { lotId: lot.id },
    });
    expect(movementsCount).toBe(5);
  });
});
