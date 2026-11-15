import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { CustomerService } from '../../src/modules/customers/application/customer.service';
import { SupplierService } from '../../src/modules/suppliers/application/supplier.service';

/** Terceros unificado (acuerdo del 4 de octubre): todo cliente y proveedor es un tercero. */
describe('Terceros unificado', () => {
  let app: INestApplication;
  let customers: CustomerService;
  let suppliers: SupplierService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    customers = module.get(CustomerService);
    suppliers = module.get(SupplierService);
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  it('un cliente creado desde el POS queda registrado como tercero cliente', async () => {
    const customer = await customers.createCustomer({
      documentType: 'CC',
      documentNumber: '1098765432',
      name: 'Laura Restrepo',
      phone: '3001234567',
    });
    const third = await prisma.thirdParty.findUniqueOrThrow({
      where: { documentNumber: '1098765432' },
    });
    expect(third.isCustomer).toBe(true);
    expect(third.isSupplier).toBe(false);
    expect(third.customerId).toBe(customer.id);
    expect(third.name).toBe('Laura Restrepo');
  });

  it('un proveedor con el mismo documento de un cliente comparte el tercero con ambos roles', async () => {
    const customer = await customers.createCustomer({
      documentType: 'NIT',
      documentNumber: '900123456',
      name: 'Droguería Aliada',
    });
    const supplier = await suppliers.createSupplier({
      taxId: '900123456',
      name: 'Droguería Aliada S.A.S.',
    });

    const thirds = await prisma.thirdParty.findMany({ where: { documentNumber: '900123456' } });
    expect(thirds).toHaveLength(1);
    expect(thirds[0]).toMatchObject({
      isCustomer: true,
      isSupplier: true,
      customerId: customer.id,
      supplierId: supplier.id,
    });
  });

  it('un proveedor nuevo queda como tercero con NIT', async () => {
    const supplier = await suppliers.createSupplier({
      taxId: '800555111',
      name: 'Distribuidora Andina',
    });
    const third = await prisma.thirdParty.findUniqueOrThrow({ where: { supplierId: supplier.id } });
    expect(third.documentType).toBe('NIT');
    expect(third.isSupplier).toBe(true);
  });
  describe('editar desde clientes o proveedores actualiza el tercero', () => {
    const admin = { roles: ['admin'] };

    it('los datos de un cliente editado desde su módulo pasan a su tercero', async () => {
      const customer = await customers.createCustomer({
        documentType: 'CC',
        documentNumber: '1012345678',
        name: 'Ana Gómez',
      });
      await customers.updateCustomer(customer.id, {
        name: 'Ana María Gómez',
        phone: '3105550000',
        email: 'ana@example.com',
        address: 'Calle 10 # 5-20',
      });
      const third = await prisma.thirdParty.findUniqueOrThrow({
        where: { customerId: customer.id },
      });
      expect(third).toMatchObject({
        name: 'Ana María Gómez',
        phone: '3105550000',
        email: 'ana@example.com',
        address: 'Calle 10 # 5-20',
        isActive: true,
      });
    });

    it('un administrador que corrige el documento del cliente lo corrige también en el tercero', async () => {
      const customer = await customers.createCustomer({
        documentType: 'CC',
        documentNumber: '1012345679',
        name: 'Pedro Ruiz',
      });
      await customers.updateCustomer(customer.id, { documentNumber: '1012345670' }, admin);
      const third = await prisma.thirdParty.findUniqueOrThrow({
        where: { customerId: customer.id },
      });
      expect(third.documentNumber).toBe('1012345670');
    });

    it('un proveedor editado desde su módulo actualiza el tercero y el cliente que lo comparte', async () => {
      const customer = await customers.createCustomer({
        documentType: 'NIT',
        documentNumber: '900777888',
        name: 'Comercial del Norte',
      });
      const supplier = await suppliers.createSupplier({
        taxId: '900777888',
        name: 'Comercial del Norte',
      });
      await suppliers.updateSupplier(supplier.id, {
        name: 'Comercial del Norte S.A.S.',
        contactName: 'Marta Díaz',
        phone: '6015550101',
      });
      const third = await prisma.thirdParty.findUniqueOrThrow({
        where: { supplierId: supplier.id },
      });
      expect(third).toMatchObject({
        name: 'Comercial del Norte S.A.S.',
        contactName: 'Marta Díaz',
        phone: '6015550101',
      });
      const sharedCustomer = await prisma.customer.findUniqueOrThrow({
        where: { id: customer.id },
      });
      expect(sharedCustomer).toMatchObject({
        name: 'Comercial del Norte S.A.S.',
        phone: '6015550101',
        isActive: true,
      });
    });

    it('el documento de un tercero con ambos roles no cambia desde uno solo y nada se escribe', async () => {
      const customer = await customers.createCustomer({
        documentType: 'NIT',
        documentNumber: '900111222',
        name: 'Aliado Doble',
      });
      await suppliers.createSupplier({ taxId: '900111222', name: 'Aliado Doble' });
      await expect(
        customers.updateCustomer(
          customer.id,
          { documentNumber: '900111223', name: 'Otro nombre' },
          admin,
        ),
      ).rejects.toThrow(/cliente y proveedor a la vez/);
      const unchanged = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      expect(unchanged).toMatchObject({ documentNumber: '900111222', name: 'Aliado Doble' });
      const third = await prisma.thirdParty.findUniqueOrThrow({
        where: { customerId: customer.id },
      });
      expect(third).toMatchObject({ documentNumber: '900111222', name: 'Aliado Doble' });
    });

    it('inactivar el cliente desde su módulo no inactiva al tercero ni al proveedor', async () => {
      const customer = await customers.createCustomer({
        documentType: 'NIT',
        documentNumber: '900333444',
        name: 'Proveedor que compra',
      });
      const supplier = await suppliers.createSupplier({
        taxId: '900333444',
        name: 'Proveedor que compra',
      });
      await customers.updateCustomer(customer.id, { isActive: false });
      const third = await prisma.thirdParty.findUniqueOrThrow({
        where: { customerId: customer.id },
      });
      expect(third.isActive).toBe(true);
      expect(
        (await prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } })).isActive,
      ).toBe(true);
    });
  });
});
