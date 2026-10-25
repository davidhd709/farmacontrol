import { mkdirSync, writeFileSync } from 'node:fs';
import {
  adminStateFile,
  apiAs,
  call,
  cashierStateFile,
  fixturesFile,
  outputDir,
  uniqueCode,
  type E2eFixtures,
} from './support/api';

/** Datos comunes a todas las pruebas y sesiones guardadas del administrador y del cajero. */
export default async function globalSetup() {
  const adminUsername = process.env.E2E_ADMIN_USERNAME;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) {
    throw new Error('Faltan E2E_ADMIN_USERNAME/E2E_ADMIN_PASSWORD: ejecute `pnpm test:e2e`.');
  }
  mkdirSync(outputDir, { recursive: true });

  const admin = await apiAs(adminUsername, adminPassword);

  const cashier = { username: 'e2e_cajero', password: `Cajero-${uniqueCode('PW')}` };
  await call(admin, 'post', 'users', { ...cashier, roles: ['cajero'] });

  const category = await call<{ id: string }>(admin, 'post', 'categories', {
    name: `Categoría ${uniqueCode('E2E')}`,
  });
  const supplier = await call<{ supplierId: string | null }>(admin, 'post', 'third-parties', {
    personType: 'JURIDICA',
    documentType: 'NIT',
    documentNumber: `900${Date.now().toString().slice(-6)}`,
    verificationDigit: '1',
    name: 'Droguería Mayorista E2E S.A.S.',
    isSupplier: true,
  });
  const customerDocument = `10${Date.now().toString().slice(-8)}`;
  const customer = await call<{ customerId: string | null; name: string }>(
    admin,
    'post',
    'third-parties',
    {
      personType: 'NATURAL',
      documentType: 'CC',
      documentNumber: customerDocument,
      name: 'Cliente Crédito E2E',
      isCustomer: true,
    },
  );
  if (!supplier.supplierId || !customer.customerId) {
    throw new Error('El tercero no devolvió supplierId/customerId.');
  }

  const fixtures: E2eFixtures = {
    admin: { username: adminUsername, password: adminPassword },
    cashier,
    categoryId: category.id,
    supplierId: supplier.supplierId,
    customer: { id: customer.customerId, name: customer.name, documentNumber: customerDocument },
  };
  writeFileSync(fixturesFile, JSON.stringify(fixtures, null, 2));

  await admin.storageState({ path: adminStateFile });
  const cashierApi = await apiAs(cashier.username, cashier.password);
  await cashierApi.storageState({ path: cashierStateFile });
  await Promise.all([admin.dispose(), cashierApi.dispose()]);
}
