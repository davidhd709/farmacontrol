import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/**
 * Permisos de terceros por rol (correcciones del cliente, 2026-11-03): lo que un rol no tiene
 * en pantalla no lo puede hacer por la API. Cajero solo crea clientes; cartera ve y edita solo
 * clientes; compras solo proveedores; desactivar es solo de admin. El alcance lo aplica la API.
 */
describe('Terceros: alcance por rol en la API', () => {
  let app: INestApplication;
  const cookies: Record<string, string> = {};
  let customerTp: string;
  let supplierTp: string;
  let customerId: string;
  let supplierId: string;

  const thirdParty = (
    documentNumber: string,
    roles: { isCustomer?: boolean; isSupplier?: boolean },
  ) => ({
    personType: 'NATURAL',
    documentType: 'CC',
    documentNumber,
    name: `Tercero ${documentNumber}`,
    taxRegime: 'NO_RESPONSABLE_IVA',
    isCustomer: false,
    isSupplier: false,
    isEmployee: false,
    isOther: false,
    ...roles,
  });

  const call = (
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    role: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/api/v1/${path}`)
      .set('Cookie', cookies[role]);
    return body ? req.send(body) : req;
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await cleanTestDatabase();
    await seedRbac(prisma);
    const auth = module.get(AuthService);
    const admin = await module
      .get(UserProvisioningService)
      .provisionInitialUser({ username: 'terceros_admin', password: 'AdminPassword#2026' });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    cookies.admin = `${SESSION_COOKIE_NAME}=${(await auth.login('terceros_admin', 'AdminPassword#2026')).rawToken}`;
    for (const roleName of ['cajero', 'cartera', 'compras', 'supervisor', 'inventario']) {
      const user = await prisma.user.create({
        data: { username: `terceros_${roleName}`, passwordHash: admin.passwordHash },
      });
      const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      cookies[roleName] =
        `${SESSION_COOKIE_NAME}=${(await auth.login(`terceros_${roleName}`, 'AdminPassword#2026')).rawToken}`;
    }
  }, 60000);

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "third_parties", "customers", "suppliers" CASCADE`;
    const c = await call(
      'post',
      'third-parties',
      'admin',
      thirdParty('1001', { isCustomer: true }),
    ).expect(201);
    const s = await call(
      'post',
      'third-parties',
      'admin',
      thirdParty('2002', { isSupplier: true }),
    ).expect(201);
    customerTp = c.body.id;
    supplierTp = s.body.id;
    customerId = c.body.customerId;
    supplierId = s.body.supplierId;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  describe('cajero: solo crea clientes desde el POS', () => {
    it('crea, pero no edita ni desactiva clientes, ni ve el directorio', async () => {
      await call('post', 'customers', 'cajero', {
        documentType: 'CC',
        documentNumber: '3003',
        name: 'Cliente POS',
      }).expect(201);
      await call('put', `customers/${customerId}`, 'cajero', { name: 'Otro nombre' }).expect(403);
      await call('delete', `customers/${customerId}`, 'cajero').expect(403);
      await call('get', 'third-parties', 'cajero').expect(403);
      await call(
        'post',
        'third-parties',
        'cajero',
        thirdParty('3004', { isCustomer: true }),
      ).expect(403);
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).name).toBe(
        'Tercero 1001',
      );
    });
  });

  describe('cartera: directorio filtrado a clientes', () => {
    it('lista solo clientes aunque pida otro tipo', async () => {
      const list = await call('get', 'third-parties', 'cartera').expect(200);
      expect(list.body.items.map((t: { id: string }) => t.id)).toEqual([customerTp]);
      const all = await call('get', 'third-parties?role=ALL', 'cartera').expect(200);
      expect(all.body.items.map((t: { id: string }) => t.id)).toEqual([customerTp]);
      await call('get', 'third-parties?role=SUPPLIER', 'cartera').expect(403);
      await call('get', 'third-parties?role=EMPLOYEE', 'cartera').expect(403);
      await call('get', `third-parties/${supplierTp}`, 'cartera').expect(404);
      await call('get', `third-parties/${customerTp}`, 'cartera').expect(200);
    });

    it('crea y edita clientes; no toca proveedores ni cambia tipos', async () => {
      await call(
        'post',
        'third-parties',
        'cartera',
        thirdParty('4004', { isCustomer: true }),
      ).expect(201);
      await call(
        'post',
        'third-parties',
        'cartera',
        thirdParty('4005', { isSupplier: true }),
      ).expect(403);
      await call(
        'post',
        'third-parties',
        'cartera',
        thirdParty('4006', { isCustomer: true, isSupplier: true }),
      ).expect(403);
      await call('put', `third-parties/${customerTp}`, 'cartera', {
        name: 'Cliente renombrado',
      }).expect(200);
      await call('put', `third-parties/${customerTp}`, 'cartera', { isSupplier: true }).expect(403);
      await call('put', `third-parties/${customerTp}`, 'cartera', {
        isCustomer: false,
        isOther: true,
      }).expect(403);
      await call('put', `third-parties/${supplierTp}`, 'cartera', { name: 'Hackeado' }).expect(404);
      await call('put', `customers/${customerId}`, 'cartera', { name: 'Por cliente' }).expect(200);
      expect((await prisma.thirdParty.findUniqueOrThrow({ where: { id: supplierTp } })).name).toBe(
        'Tercero 2002',
      );
    });

    it('no desactiva por ninguna vía', async () => {
      await call('patch', `third-parties/${customerTp}/deactivate`, 'cartera').expect(403);
      await call('put', `third-parties/${customerTp}`, 'cartera', { isActive: false }).expect(403);
      await call('delete', `customers/${customerId}`, 'cartera').expect(403);
      await call('put', `customers/${customerId}`, 'cartera', { isActive: false }).expect(403);
      // Enviar el mismo estado no es un cambio
      await call('put', `third-parties/${customerTp}`, 'cartera', {
        isActive: true,
        name: 'Igual',
      }).expect(200);
      expect(
        (await prisma.thirdParty.findUniqueOrThrow({ where: { id: customerTp } })).isActive,
      ).toBe(true);
    });
  });

  describe('compras: directorio filtrado a proveedores', () => {
    it('lista, crea y edita proveedores; no ve clientes ni desactiva', async () => {
      const list = await call('get', 'third-parties', 'compras').expect(200);
      expect(list.body.items.map((t: { id: string }) => t.id)).toEqual([supplierTp]);
      await call('get', 'third-parties?role=CUSTOMER', 'compras').expect(403);
      await call('get', `third-parties/${customerTp}`, 'compras').expect(404);
      await call(
        'post',
        'third-parties',
        'compras',
        thirdParty('5005', { isSupplier: true }),
      ).expect(201);
      await call(
        'post',
        'third-parties',
        'compras',
        thirdParty('5006', { isCustomer: true }),
      ).expect(403);
      await call('put', `third-parties/${supplierTp}`, 'compras', {
        name: 'Proveedor renombrado',
      }).expect(200);
      await call('put', `third-parties/${customerTp}`, 'compras', { name: 'Hackeado' }).expect(404);
      await call('post', 'suppliers', 'compras', {
        taxId: '900555666',
        name: 'Proveedor directo',
      }).expect(201);
      await call('put', `suppliers/${supplierId}`, 'compras', { name: 'Por proveedor' }).expect(
        200,
      );
      await call('patch', `third-parties/${supplierTp}/deactivate`, 'compras').expect(403);
      await call('delete', `suppliers/${supplierId}`, 'compras').expect(403);
      await call('put', `suppliers/${supplierId}`, 'compras', { isActive: false }).expect(403);
    });
  });

  it('inventario (solo suppliers:read) no ve el directorio', async () => {
    await call('get', 'third-parties', 'inventario').expect(403);
    await call('get', 'suppliers', 'inventario').expect(200);
  });

  it('supervisor ve y edita todo, pero no desactiva', async () => {
    const list = await call('get', 'third-parties', 'supervisor').expect(200);
    expect(list.body.items).toHaveLength(2);
    await call('put', `third-parties/${supplierTp}`, 'supervisor', {
      name: 'Editado por supervisor',
    }).expect(200);
    await call('patch', `third-parties/${customerTp}/deactivate`, 'supervisor').expect(403);
    await call('put', `third-parties/${customerTp}`, 'supervisor', { isActive: false }).expect(403);
  });

  it('admin desactiva y reactiva por el directorio y por las rutas de cliente y proveedor', async () => {
    await call('patch', `third-parties/${customerTp}/deactivate`, 'admin').expect(200);
    await call('patch', `third-parties/${customerTp}/activate`, 'admin').expect(200);
    await call('delete', `suppliers/${supplierId}`, 'admin').expect(200);
    expect((await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } })).isActive).toBe(
      false,
    );
  });

  it('el seed retira de los roles base los permisos que ya no tienen (bases existentes)', async () => {
    const cajero = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    const manage = await prisma.permission.findUniqueOrThrow({
      where: { name: SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE },
    });
    await prisma.rolePermission.create({ data: { roleId: cajero.id, permissionId: manage.id } });
    const result = await seedRbac(prisma);
    expect(result.rolePermissionsRemoved).toBe(1);
    expect(
      await prisma.rolePermission.count({ where: { roleId: cajero.id, permissionId: manage.id } }),
    ).toBe(0);
  });
});
