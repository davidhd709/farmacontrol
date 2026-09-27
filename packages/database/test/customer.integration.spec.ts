import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '../src';

describe('Customers — Integridad de Persistencia en PostgreSQL (Integration)', () => {
  beforeAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();

    // Reinsertar cliente por defecto si se limpió
    await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final (Cuantías Menores)',
        isDefault: true,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  it('permite registrar clientes regulares y consultar el cliente por defecto', async () => {
    const customer = await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '1020304050',
        name: 'María Alejandra Restrepo',
        phone: '3109876543',
        email: 'maria.restrepo@example.com',
        address: 'Carrera 15 # 45-20',
      },
    });

    expect(customer.id).toBeDefined();
    expect(customer.name).toBe('María Alejandra Restrepo');
    expect(customer.isDefault).toBe(false);
    expect(customer.isActive).toBe(true);

    const defaultCustomer = await prisma.customer.findFirst({
      where: { isDefault: true },
    });

    expect(defaultCustomer).toBeDefined();
    expect(defaultCustomer?.documentNumber).toBe('222222222222');
  });

  it('rechaza documentos de identidad duplicados mediante índice único', async () => {
    await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '99887766',
        name: 'Cliente Original',
      },
    });

    await expect(
      prisma.customer.create({
        data: {
          documentType: 'CC',
          documentNumber: '99887766',
          name: 'Cliente Duplicado',
        },
      })
    ).rejects.toThrow();
  });

  it('permite la actualización e inactivación lógica de clientes', async () => {
    const customer = await prisma.customer.create({
      data: {
        documentType: 'NIT',
        documentNumber: '900555444-3',
        name: 'Clínica San Rafael',
      },
    });

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        phone: '6015551234',
        isActive: false,
      },
    });

    expect(updated.isActive).toBe(false);
    expect(updated.phone).toBe('6015551234');
  });
});
