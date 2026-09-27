import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '../src';

describe('Supplier — Integridad de Persistencia en PostgreSQL (Integration)', () => {
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

  it('debe crear un proveedor válido con taxId único y valores por defecto', async () => {
    const supplier = await prisma.supplier.create({
      data: {
        taxId: '900123456-1',
        name: 'Distribuidora Farmacéutica del Valle S.A.S.',
        contactName: 'Carlos Gómez',
        phone: '+57 300 123 4567',
        email: 'ventas@farmavalle.com',
        address: 'Calle 10 # 45-20, Cali',
      },
    });

    expect(supplier.id).toBeDefined();
    expect(supplier.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(supplier.taxId).toBe('900123456-1');
    expect(supplier.name).toBe('Distribuidora Farmacéutica del Valle S.A.S.');
    expect(supplier.contactName).toBe('Carlos Gómez');
    expect(supplier.phone).toBe('+57 300 123 4567');
    expect(supplier.email).toBe('ventas@farmavalle.com');
    expect(supplier.address).toBe('Calle 10 # 45-20, Cali');
    expect(supplier.isActive).toBe(true);
    expect(supplier.createdAt).toBeInstanceOf(Date);
    expect(supplier.updatedAt).toBeInstanceOf(Date);
  });

  it('debe rechazar la creación de proveedores con el mismo taxId (NIT duplicado)', async () => {
    await prisma.supplier.create({
      data: {
        taxId: '800987654-3',
        name: 'Laboratorios Genéricos de Colombia',
      },
    });

    await expect(
      prisma.supplier.create({
        data: {
          taxId: '800987654-3',
          name: 'Laboratorios Genéricos Sucursal 2',
        },
      })
    ).rejects.toThrow();
  });

  it('permite actualizar datos del proveedor y registrar inactivación lógica', async () => {
    const created = await prisma.supplier.create({
      data: {
        taxId: '901234567-8',
        name: 'Droguerías Aliadas',
        phone: '6023334444',
      },
    });

    const updated = await prisma.supplier.update({
      where: { id: created.id },
      data: {
        phone: '6025556666',
        isActive: false,
      },
    });

    expect(updated.phone).toBe('6025556666');
    expect(updated.isActive).toBe(false);
  });
});
