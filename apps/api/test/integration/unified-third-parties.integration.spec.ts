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
    const third = await prisma.thirdParty.findUniqueOrThrow({ where: { documentNumber: '1098765432' } });
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
    const supplier = await suppliers.createSupplier({ taxId: '900123456', name: 'Droguería Aliada S.A.S.' });

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
    const supplier = await suppliers.createSupplier({ taxId: '800555111', name: 'Distribuidora Andina' });
    const third = await prisma.thirdParty.findUniqueOrThrow({ where: { supplierId: supplier.id } });
    expect(third.documentType).toBe('NIT');
    expect(third.isSupplier).toBe(true);
  });
});
