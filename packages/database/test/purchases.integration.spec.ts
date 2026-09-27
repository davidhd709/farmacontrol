import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '../src';
import { Prisma } from '@prisma/client';

describe('Purchases & PurchaseLines — Integridad de Persistencia en PostgreSQL (Integration)', () => {
  let supplierId: string;
  let categoryId: string;
  let productId: string;
  let locationId: string;
  let lotId: string;

  beforeAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();

    const supplier = await prisma.supplier.create({
      data: {
        taxId: '900999001-1',
        name: 'Distribuidora Farmacéutica del Norte',
      },
    });
    supplierId = supplier.id;

    const category = await prisma.category.create({
      data: {
        name: 'Antibióticos',
      },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        categoryId,
        code: 'AMX-500',
        name: 'Amoxicilina 500mg',
        basePrice: new Prisma.Decimal('1200.00'),
        baseCost: new Prisma.Decimal('800.00'),
      },
    });
    productId = product.id;

    const location = await prisma.location.create({
      data: {
        code: 'BOD-01',
        name: 'Bodega Principal',
      },
    });
    locationId = location.id;

    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId,
        lotNumber: 'LOTE-AMX-2026',
        expirationDate: new Date('2028-12-31'),
        currentQuantity: 100,
      },
    });
    lotId = lot.id;
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  });

  it('debe registrar una compra con sus líneas y montos exactos', async () => {
    const purchase = await prisma.purchase.create({
      data: {
        supplierId,
        invoiceNumber: 'FAC-2026-001',
        purchaseDate: new Date('2026-09-26'),
        totalAmount: new Prisma.Decimal('80000.00'),
        notes: 'Compra inicial de antibióticos',
        lines: {
          create: [
            {
              productId,
              lotId,
              quantityCommercial: new Prisma.Decimal('100.0000'),
              quantityBaseUnits: 100,
              unitCost: new Prisma.Decimal('800.00'),
              subtotal: new Prisma.Decimal('80000.00'),
              lotNumber: 'LOTE-AMX-2026',
              expirationDate: new Date('2028-12-31'),
            },
          ],
        },
      },
      include: {
        lines: true,
        supplier: true,
      },
    });

    expect(purchase.id).toBeDefined();
    expect(purchase.invoiceNumber).toBe('FAC-2026-001');
    expect(purchase.totalAmount.toString()).toBe('80000');
    expect(purchase.lines).toHaveLength(1);
    expect(purchase.lines[0].quantityBaseUnits).toBe(100);
    expect(purchase.lines[0].unitCost.toString()).toBe('800');
    expect(purchase.lines[0].subtotal.toString()).toBe('80000');
  });

  it('prohíbe eliminar un proveedor que tenga compras asociadas (ON DELETE RESTRICT)', async () => {
    await prisma.purchase.create({
      data: {
        supplierId,
        invoiceNumber: 'FAC-2026-002',
        purchaseDate: new Date('2026-09-26'),
        totalAmount: new Prisma.Decimal('5000.00'),
        lines: {
          create: [
            {
              productId,
              lotId,
              quantityCommercial: new Prisma.Decimal('5.0000'),
              quantityBaseUnits: 5,
              unitCost: new Prisma.Decimal('1000.00'),
              subtotal: new Prisma.Decimal('5000.00'),
              lotNumber: 'LOTE-AMX-2026',
              expirationDate: new Date('2028-12-31'),
            },
          ],
        },
      },
    });

    await expect(
      prisma.supplier.delete({
        where: { id: supplierId },
      })
    ).rejects.toThrow();
  });
});
