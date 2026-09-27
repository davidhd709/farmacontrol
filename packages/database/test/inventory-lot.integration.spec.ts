import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma, cleanTestDatabase } from '../src';

describe('InventoryLot & Location — Integridad de Persistencia en PostgreSQL (Integration)', () => {
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

  it('debe registrar una ubicación de almacenamiento y un lote asociado con existencia y fecha de vencimiento', async () => {
    const category = await prisma.category.create({
      data: { name: 'Antibióticos' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'AMOX-500',
        name: 'Amoxicilina 500mg',
        baseUnit: 'CÁPSULA',
        basePrice: new Prisma.Decimal('1200.00'),
        requiresLotControl: true,
      },
    });

    const location = await prisma.location.create({
      data: {
        code: 'BOD-01',
        name: 'Bodega Principal',
        isDefault: true,
      },
    });

    const expirationDate = new Date('2027-12-31');
    const lot = await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        lotNumber: 'LOTE-AMOX-2027',
        expirationDate,
        currentQuantity: 150,
      },
    });

    expect(lot.id).toBeDefined();
    expect(lot.productId).toBe(product.id);
    expect(lot.locationId).toBe(location.id);
    expect(lot.lotNumber).toBe('LOTE-AMOX-2027');
    expect(lot.currentQuantity).toBe(150);
    expect(lot.isActive).toBe(true);
  });

  it('debe rechazar mediante restricción CHECK un saldo de cantidad negativo en el lote (current_quantity >= 0)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Analgésicos' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'IBUP-400',
        name: 'Ibuprofeno 400mg',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('800.00'),
      },
    });

    const location = await prisma.location.create({
      data: {
        code: 'BOD-02',
        name: 'Estantería Frontal',
      },
    });

    await expect(
      prisma.inventoryLot.create({
        data: {
          productId: product.id,
          locationId: location.id,
          lotNumber: 'LOTE-NEGATIVO',
          expirationDate: new Date('2028-01-01'),
          currentQuantity: -10, // Violación de CHECK
        },
      }),
    ).rejects.toThrow();
  });

  it('debe impedir duplicados de lot_number para el mismo producto y la misma ubicación', async () => {
    const category = await prisma.category.create({
      data: { name: 'Antigripales' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'DOLEX-AV',
        name: 'Dolex Avanzado',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('1500.00'),
      },
    });

    const location = await prisma.location.create({
      data: {
        code: 'BOD-03',
        name: 'Dispensario 1',
      },
    });

    await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        lotNumber: 'LOTE-UNICO-123',
        expirationDate: new Date('2026-11-30'),
        currentQuantity: 50,
      },
    });

    // Intento de duplicado en misma ubicación y producto
    await expect(
      prisma.inventoryLot.create({
        data: {
          productId: product.id,
          locationId: location.id,
          lotNumber: 'LOTE-UNICO-123',
          expirationDate: new Date('2026-11-30'),
          currentQuantity: 20,
        },
      }),
    ).rejects.toThrow();
  });

  it('debe ordenar lotes prioritariamente por fecha de vencimiento más próxima (preparación FEFO)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Vitaminas' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'VIT-C-500',
        name: 'Vitamina C 500mg',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('600.00'),
      },
    });

    const location = await prisma.location.create({
      data: {
        code: 'BOD-04',
        name: 'Bodega Climatizada',
      },
    });

    // Insertamos en orden no cronológico
    await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        lotNumber: 'LOTE-LEJANO',
        expirationDate: new Date('2028-06-01'),
        currentQuantity: 100,
      },
    });

    await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        lotNumber: 'LOTE-PROXIMO',
        expirationDate: new Date('2026-10-15'),
        currentQuantity: 40,
      },
    });

    await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        lotNumber: 'LOTE-MEDIO',
        expirationDate: new Date('2027-03-20'),
        currentQuantity: 80,
      },
    });

    const fefoOrderedLots = await prisma.inventoryLot.findMany({
      where: {
        productId: product.id,
        currentQuantity: { gt: 0 },
        isActive: true,
      },
      orderBy: {
        expirationDate: 'asc',
      },
    });

    expect(fefoOrderedLots).toHaveLength(3);
    expect(fefoOrderedLots[0].lotNumber).toBe('LOTE-PROXIMO');
    expect(fefoOrderedLots[1].lotNumber).toBe('LOTE-MEDIO');
    expect(fefoOrderedLots[2].lotNumber).toBe('LOTE-LEJANO');
  });
});
