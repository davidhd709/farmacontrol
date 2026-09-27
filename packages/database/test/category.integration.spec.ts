import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '../src';

describe('Category — Integridad de Persistencia en PostgreSQL (Integration)', () => {
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

  it('debe crear una categoría válida con UUID y valores por defecto', async () => {
    const category = await prisma.category.create({
      data: {
        name: 'Analgésicos',
        description: 'Medicamentos para el alivio del dolor y la inflamación',
      },
    });

    expect(category.id).toBeDefined();
    expect(category.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(category.name).toBe('Analgésicos');
    expect(category.description).toBe('Medicamentos para el alivio del dolor y la inflamación');
    expect(category.isActive).toBe(true);
    expect(category.createdAt).toBeInstanceOf(Date);
    expect(category.updatedAt).toBeInstanceOf(Date);
  });

  it('debe rechazar la creación de categorías con nombres duplicados exactos', async () => {
    await prisma.category.create({
      data: {
        name: 'Antibióticos',
      },
    });

    await expect(
      prisma.category.create({
        data: {
          name: 'Antibióticos',
        },
      })
    ).rejects.toThrow();
  });

  it('debe rechazar la creación de categorías con nombre duplicado insensible a mayúsculas (LOWER)', async () => {
    await prisma.category.create({
      data: {
        name: 'Vitaminas',
      },
    });

    await expect(
      prisma.category.create({
        data: {
          name: 'vitaminas',
        },
      })
    ).rejects.toThrow();
  });

  it('cleanTestDatabase debe truncar y dejar limpia la tabla categories', async () => {
    await prisma.category.create({
      data: {
        name: 'Dermatología',
      },
    });

    const countBefore = await prisma.category.count();
    expect(countBefore).toBe(1);

    await cleanTestDatabase();

    const countAfter = await prisma.category.count();
    expect(countAfter).toBe(0);
  });
});
