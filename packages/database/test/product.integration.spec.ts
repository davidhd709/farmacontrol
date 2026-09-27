import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma, cleanTestDatabase } from '../src';

describe('Product — Integridad de Persistencia en PostgreSQL (Integration)', () => {
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

  it('debe registrar un producto con atributos farmacéuticos y claves foráneas válidas', async () => {
    const category = await prisma.category.create({
      data: {
        name: 'Analgésicos',
      },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'MED-001',
        barcode: '7701234567890',
        name: 'Acetaminofén 500mg',
        genericName: 'Paracetamol',
        concentration: '500 mg',
        sanitaryRegistry: 'INVIMA 2020M-001234',
        manufacturer: 'Laboratorios Farmacia',
        description: 'Tabletas orales para el dolor de cabeza y fiebre',
        requiresLotControl: true,
        prescriptionRequired: false,
        baseUnit: 'UNIDAD',
        basePrice: new Prisma.Decimal('1200.50'),
        baseCost: new Prisma.Decimal('750.25'),
      },
    });

    expect(product.id).toBeDefined();
    expect(product.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(product.code).toBe('MED-001');
    expect(product.barcode).toBe('7701234567890');
    expect(product.name).toBe('Acetaminofén 500mg');
    expect(product.genericName).toBe('Paracetamol');
    expect(product.requiresLotControl).toBe(true);
    expect(product.baseUnit).toBe('UNIDAD');
    expect(product.basePrice.toString()).toBe('1200.5');
    expect(product.baseCost.toString()).toBe('750.25');
    expect(product.isActive).toBe(true);
    expect(product.createdAt).toBeInstanceOf(Date);
  });

  it('debe rechazar la creación de dos productos con el mismo código interno (SKU)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Antibióticos' },
    });

    await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'AMOX-500',
        name: 'Amoxicilina 500mg',
        basePrice: new Prisma.Decimal('2500.00'),
      },
    });

    await expect(
      prisma.product.create({
        data: {
          categoryId: category.id,
          code: 'AMOX-500',
          name: 'Amoxicilina Genérica 500mg',
          basePrice: new Prisma.Decimal('2300.00'),
        },
      }),
    ).rejects.toThrow();
  });

  it('debe rechazar la creación de dos productos con el mismo código independientemente de mayúsculas (LOWER)', async () => {
    const category = await prisma.category.create({
      data: { name: 'Antialérgicos' },
    });

    await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'LORA-10',
        name: 'Loratadina 10mg',
        basePrice: new Prisma.Decimal('1500.00'),
      },
    });

    await expect(
      prisma.product.create({
        data: {
          categoryId: category.id,
          code: 'lora-10',
          name: 'Loratadina Genérica 10mg',
          basePrice: new Prisma.Decimal('1400.00'),
        },
      }),
    ).rejects.toThrow();
  });

  it('debe rechazar la creación de dos productos con el mismo código de barras', async () => {
    const category = await prisma.category.create({
      data: { name: 'Vitaminas' },
    });

    await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'VIT-C-1',
        barcode: '7709999999999',
        name: 'Vitamina C 500mg',
        basePrice: new Prisma.Decimal('800.00'),
      },
    });

    await expect(
      prisma.product.create({
        data: {
          categoryId: category.id,
          code: 'VIT-C-2',
          barcode: '7709999999999',
          name: 'Vitamina C Efervescente',
          basePrice: new Prisma.Decimal('1200.00'),
        },
      }),
    ).rejects.toThrow();
  });

  it('debe impedir la eliminación (onDelete Restrict) de una categoría que tenga productos asociados', async () => {
    const category = await prisma.category.create({
      data: { name: 'Cardiología' },
    });

    await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'LOSAR-50',
        name: 'Losartán 50mg',
        basePrice: new Prisma.Decimal('3000.00'),
      },
    });

    await expect(
      prisma.category.delete({
        where: { id: category.id },
      }),
    ).rejects.toThrow();
  });

  it('debe permitir almacenar y recuperar valores monetarios exactos sin pérdida de precisión de coma flotante', async () => {
    const category = await prisma.category.create({
      data: { name: 'Oftalmología' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'GOTAS-01',
        name: 'Lágrimas Artificiales',
        basePrice: new Prisma.Decimal('18549.99'),
        baseCost: new Prisma.Decimal('12345.67'),
      },
    });

    const retrieved = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    expect(retrieved.basePrice.toFixed(2)).toBe('18549.99');
    expect(retrieved.baseCost.toFixed(2)).toBe('12345.67');
  });
});
