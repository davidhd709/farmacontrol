import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma, cleanTestDatabase } from '../src';

describe('ProductPresentation — Integridad de Persistencia en PostgreSQL (Integration)', () => {
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

  it('debe registrar una presentación comercial asociada a un producto con factor de conversión entero y valores decimales exactos', async () => {
    const category = await prisma.category.create({
      data: { name: 'Analgésicos' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'ACET-500',
        name: 'Acetaminofén 500mg',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('500.00'),
        baseCost: new Prisma.Decimal('200.00'),
      },
    });

    const presentation = await prisma.productPresentation.create({
      data: {
        productId: product.id,
        name: 'Caja x 30',
        barcode: '7709876543210',
        conversionFactor: 30,
        price: new Prisma.Decimal('14500.50'),
        cost: new Prisma.Decimal('5800.25'),
        isDefault: true,
      },
    });

    expect(presentation.id).toBeDefined();
    expect(presentation.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(presentation.productId).toBe(product.id);
    expect(presentation.name).toBe('Caja x 30');
    expect(presentation.barcode).toBe('7709876543210');
    expect(presentation.conversionFactor).toBe(30);
    expect(presentation.price.toFixed(2)).toBe('14500.50');
    expect(presentation.cost.toFixed(2)).toBe('5800.25');
    expect(presentation.isDefault).toBe(true);
    expect(presentation.isActive).toBe(true);
    expect(presentation.createdAt).toBeInstanceOf(Date);
  });

  it('debe rechazar (CHECK constraint) presentaciones con factor de conversión menor o igual a cero', async () => {
    const category = await prisma.category.create({
      data: { name: 'Antibióticos' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'AMOX-500',
        name: 'Amoxicilina 500mg',
        basePrice: new Prisma.Decimal('2000.00'),
      },
    });

    // Factor 0
    await expect(
      prisma.productPresentation.create({
        data: {
          productId: product.id,
          name: 'Invalido Factor Cero',
          conversionFactor: 0,
          price: new Prisma.Decimal('1000.00'),
        },
      }),
    ).rejects.toThrow();

    // Factor negativo
    await expect(
      prisma.productPresentation.create({
        data: {
          productId: product.id,
          name: 'Invalido Factor Negativo',
          conversionFactor: -5,
          price: new Prisma.Decimal('1000.00'),
        },
      }),
    ).rejects.toThrow();
  });

  it('debe rechazar (CHECK constraint) presentaciones con precios o costos negativos', async () => {
    const category = await prisma.category.create({
      data: { name: 'Antialérgicos' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'LORA-10',
        name: 'Loratadina 10mg',
        basePrice: new Prisma.Decimal('1500.00'),
      },
    });

    // Precio negativo
    await expect(
      prisma.productPresentation.create({
        data: {
          productId: product.id,
          name: 'Caja x 10',
          conversionFactor: 10,
          price: new Prisma.Decimal('-500.00'),
        },
      }),
    ).rejects.toThrow();

    // Costo negativo
    await expect(
      prisma.productPresentation.create({
        data: {
          productId: product.id,
          name: 'Caja x 10',
          conversionFactor: 10,
          price: new Prisma.Decimal('15000.00'),
          cost: new Prisma.Decimal('-200.00'),
        },
      }),
    ).rejects.toThrow();
  });

  it('debe rechazar presentaciones con el mismo nombre para el mismo producto (unique compound key [productId, name])', async () => {
    const category = await prisma.category.create({
      data: { name: 'Gastroenterología' },
    });

    const productA = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'OMEP-20',
        name: 'Omeprazol 20mg',
        basePrice: new Prisma.Decimal('1000.00'),
      },
    });

    const productB = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'ESOM-20',
        name: 'Esomeprazol 20mg',
        basePrice: new Prisma.Decimal('2000.00'),
      },
    });

    await prisma.productPresentation.create({
      data: {
        productId: productA.id,
        name: 'Caja x 14',
        conversionFactor: 14,
        price: new Prisma.Decimal('12000.00'),
      },
    });

    // Mismo producto y mismo nombre -> debe fallar
    await expect(
      prisma.productPresentation.create({
        data: {
          productId: productA.id,
          name: 'Caja x 14',
          conversionFactor: 14,
          price: new Prisma.Decimal('12500.00'),
        },
      }),
    ).rejects.toThrow();

    // Mismo nombre pero para un producto diferente -> debe permitirse
    const presentationB = await prisma.productPresentation.create({
      data: {
        productId: productB.id,
        name: 'Caja x 14',
        conversionFactor: 14,
        price: new Prisma.Decimal('24000.00'),
      },
    });
    expect(presentationB.id).toBeDefined();
  });

  it('debe rechazar presentaciones con el mismo código de barras (unique barcode)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Cardiología' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'LOS-50',
        name: 'Losartán 50mg',
        basePrice: new Prisma.Decimal('1500.00'),
      },
    });

    await prisma.productPresentation.create({
      data: {
        productId: product.id,
        name: 'Blíster x 10',
        barcode: '7701111222233',
        conversionFactor: 10,
        price: new Prisma.Decimal('14000.00'),
      },
    });

    await expect(
      prisma.productPresentation.create({
        data: {
          productId: product.id,
          name: 'Caja x 30',
          barcode: '7701111222233',
          conversionFactor: 30,
          price: new Prisma.Decimal('40000.00'),
        },
      }),
    ).rejects.toThrow();
  });

  it('debe impedir la eliminación (onDelete Restrict) de un producto que tenga presentaciones comerciales asociadas', async () => {
    const category = await prisma.category.create({
      data: { name: 'Oftalmología' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'GOT-01',
        name: 'Gotas Lubricantes',
        basePrice: new Prisma.Decimal('20000.00'),
      },
    });

    await prisma.productPresentation.create({
      data: {
        productId: product.id,
        name: 'Frasco 15ml',
        conversionFactor: 1,
        price: new Prisma.Decimal('20000.00'),
      },
    });

    await expect(
      prisma.product.delete({
        where: { id: product.id },
      }),
    ).rejects.toThrow();
  });

  it('debe permitir consultar un producto con todas sus presentaciones ordenadas', async () => {
    const category = await prisma.category.create({
      data: { name: 'Pediatría' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'IBU-PED',
        name: 'Ibuprofeno Suspensión 100mg/5ml',
        baseUnit: 'FRASCO',
        basePrice: new Prisma.Decimal('8500.00'),
      },
    });

    await prisma.productPresentation.createMany({
      data: [
        {
          productId: product.id,
          name: 'Frasco 120ml',
          conversionFactor: 1,
          price: new Prisma.Decimal('8500.00'),
          isDefault: true,
        },
        {
          productId: product.id,
          name: 'Pack x 2 Frascos',
          conversionFactor: 2,
          price: new Prisma.Decimal('16000.00'),
          isDefault: false,
        },
      ],
    });

    const result = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: {
        presentations: {
          orderBy: { conversionFactor: 'asc' },
        },
      },
    });

    expect(result.presentations).toHaveLength(2);
    expect(result.presentations[0].conversionFactor).toBe(1);
    expect(result.presentations[0].isDefault).toBe(true);
    expect(result.presentations[1].conversionFactor).toBe(2);
    expect(result.presentations[1].price.toFixed(2)).toBe('16000.00');
  });
});
