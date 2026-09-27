import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma, cleanTestDatabase } from '../src';

describe('InventoryMovement (Kardex) — Integridad de Persistencia en PostgreSQL (Integration)', () => {
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

  it('debe registrar un movimiento de entrada y mantener consistencia con el saldo del lote', async () => {
    const category = await prisma.category.create({
      data: { name: 'Cardiovasculares' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'LOSAR-50',
        name: 'Losartán 50mg',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('1000.00'),
      },
    });

    const location = await prisma.location.create({
      data: { code: 'BOD-KARDEX', name: 'Bodega Kardex' },
    });

    const lot = await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        lotNumber: 'LT-KARDEX-01',
        expirationDate: new Date('2028-05-10'),
        currentQuantity: 0,
      },
    });

    // Ejecutamos movimiento transaccional: Entrada de compra de 100 unidades
    const movement = await prisma.$transaction(async (tx) => {
      const updatedLot = await tx.inventoryLot.update({
        where: { id: lot.id },
        data: { currentQuantity: { increment: 100 } },
      });

      return tx.inventoryMovement.create({
        data: {
          movementType: 'ENTRADA_COMPRA',
          productId: product.id,
          lotId: lot.id,
          quantityBaseUnits: 100,
          presentationFactorHistorical: 1,
          balanceAfterBaseUnits: updatedLot.currentQuantity,
          referenceDocumentType: 'COMPRA',
          referenceDocumentId: 'FAC-PROV-1029',
          notes: 'Ingreso inicial por compra a distribuidor',
        },
      });
    });

    expect(movement.id).toBeDefined();
    expect(movement.quantityBaseUnits).toBe(100);
    expect(movement.balanceAfterBaseUnits).toBe(100);

    const checkLot = await prisma.inventoryLot.findUnique({
      where: { id: lot.id },
    });
    expect(checkLot?.currentQuantity).toBe(100);
  });

  it('debe rechazar mediante restricción CHECK un balance posterior negativo en el movimiento (chk_movements_balance_non_negative)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Dermatológicos' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'BETAM-01',
        name: 'Betametasona Crema',
        baseUnit: 'TUBO',
        basePrice: new Prisma.Decimal('7500.00'),
      },
    });

    const location = await prisma.location.create({
      data: { code: 'BOD-DERMA', name: 'Bodega Dermatología' },
    });

    const lot = await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        lotNumber: 'LT-DERMA-01',
        expirationDate: new Date('2027-11-20'),
        currentQuantity: 10,
      },
    });

    await expect(
      prisma.inventoryMovement.create({
        data: {
          movementType: 'SALIDA_VENTA',
          productId: product.id,
          lotId: lot.id,
          quantityBaseUnits: -15,
          balanceAfterBaseUnits: -5, // Violación de CHECK (balance_after_base_units >= 0)
        },
      }),
    ).rejects.toThrow();
  });
});
