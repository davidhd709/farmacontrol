import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('SupplierController (Integration with PostgreSQL & RBAC)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let adminCookie: string;
  let cajeroCookie: string;
  let comprasCookie: string;

  beforeAll(async () => {
    await cleanTestDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    provisioningService = moduleFixture.get(UserProvisioningService);
    authService = moduleFixture.get(AuthService);
  }, 30000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    const admin = await provisioningService.provisionInitialUser({
      username: 'supplier_admin',
      password: 'AdminPassword#2026',
    });

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: {
        userId: admin.id!,
        roleId: adminRole.id,
      },
    });

    const adminLogin = await authService.login('supplier_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    const cajeroUser = await prisma.user.create({
      data: {
        username: 'supplier_cajero',
        passwordHash: admin.passwordHash,
        isActive: true,
      },
    });

    const cajeroRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({
      data: {
        userId: cajeroUser.id,
        roleId: cajeroRole.id,
      },
    });

    const cajeroLogin = await authService.login('supplier_cajero', 'AdminPassword#2026');
    cajeroCookie = `${SESSION_COOKIE_NAME}=${cajeroLogin.rawToken}`;

    const comprasUser = await prisma.user.create({
      data: {
        username: 'supplier_compras',
        passwordHash: admin.passwordHash,
        isActive: true,
      },
    });
    const comprasRole = await prisma.role.findUniqueOrThrow({ where: { name: 'compras' } });
    await prisma.userRole.create({
      data: { userId: comprasUser.id, roleId: comprasRole.id },
    });
    const comprasLogin = await authService.login('supplier_compras', 'AdminPassword#2026');
    comprasCookie = `${SESSION_COOKIE_NAME}=${comprasLogin.rawToken}`;
  }, 30000);

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
    await prisma.$disconnect();
  });

  it('POST /api/v1/suppliers — crea un proveedor exitosamente con permisos de administrador', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Cookie', [adminCookie])
      .send({
        taxId: '900999888-1',
        name: 'Distribuciones Farmacéuticas del Caribe',
        contactName: 'Marta Solano',
        phone: '3009998888',
        email: 'ventas@farmacaribe.com',
        address: 'Calle 30 # 20-50, Barranquilla',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.taxId).toBe('900999888-1');
    expect(res.body.name).toBe('Distribuciones Farmacéuticas del Caribe');
    expect(res.body.isActive).toBe(true);

    const dbRecord = await prisma.supplier.findUnique({
      where: { id: res.body.id },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.taxId).toBe('900999888-1');
  });

  it('POST /api/v1/suppliers — rechaza creación con 409 si el taxId ya existe', async () => {
    await prisma.supplier.create({
      data: {
        taxId: '900111222-3',
        name: 'Proveedor Existente',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Cookie', [adminCookie])
      .send({
        taxId: '900111222-3',
        name: 'Otro Proveedor con mismo NIT',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Ya existe un proveedor registrado');
  });

  it('POST /api/v1/suppliers — deniega acceso con 403 a usuarios sin permiso suppliers:manage', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Cookie', [cajeroCookie])
      .send({
        taxId: '900777666-5',
        name: 'Laboratorios Sin Permiso',
      });

    expect(res.status).toBe(403);
  });

  it('GET /api/v1/suppliers — lista proveedores con paginación y búsqueda', async () => {
    await prisma.supplier.createMany({
      data: [
        { taxId: '900001', name: 'Drogas La Rebaja' },
        { taxId: '900002', name: 'Distribuidora Farmacéutica Andina' },
        { taxId: '900003', name: 'Laboratorios Genfar' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/suppliers?search=Andina')
      .set('Cookie', [adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('Distribuidora Farmacéutica Andina');
    expect(res.body.total).toBe(1);
  });

  it('PUT /api/v1/suppliers/:id — actualiza datos del proveedor', async () => {
    const created = await prisma.supplier.create({
      data: {
        taxId: '900444555-1',
        name: 'Proveedor Para Editar',
        phone: '6012223333',
      },
    });

    const res = await request(app.getHttpServer())
      .put(`/api/v1/suppliers/${created.id}`)
      .set('Cookie', [adminCookie])
      .send({
        name: 'Proveedor Nombre Corregido',
        phone: '6019998888',
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Proveedor Nombre Corregido');
    expect(res.body.phone).toBe('6019998888');
  });

  it('PUT permite al administrador corregir el NIT sin cambiar el supplierId y rechaza duplicados', async () => {
    const original = await prisma.supplier.create({
      data: { taxId: '900100100-1', name: 'Proveedor original' },
    });
    await prisma.supplier.create({
      data: { taxId: '900200200-2', name: 'Proveedor existente' },
    });

    const corrected = await request(app.getHttpServer())
      .put('/api/v1/suppliers/' + original.id)
      .set('Cookie', [adminCookie])
      .send({ taxId: '900100100-3' });

    expect(corrected.status).toBe(200);
    expect(corrected.body.id).toBe(original.id);
    expect(corrected.body.taxId).toBe('900100100-3');

    const duplicate = await request(app.getHttpServer())
      .put('/api/v1/suppliers/' + original.id)
      .set('Cookie', [adminCookie])
      .send({ taxId: '900200200-2' });

    expect(duplicate.status).toBe(409);
    const persisted = await prisma.supplier.findUniqueOrThrow({ where: { id: original.id } });
    expect(persisted.taxId).toBe('900100100-3');
  });

  it('PUT impide a Compras cambiar el NIT pero conserva la edición ordinaria', async () => {
    const supplier = await prisma.supplier.create({
      data: { taxId: '900300300-3', name: 'Proveedor inicial' },
    });

    const forbidden = await request(app.getHttpServer())
      .put('/api/v1/suppliers/' + supplier.id)
      .set('Cookie', [comprasCookie])
      .send({ taxId: '900300300-4', name: 'No debe persistir' });

    expect(forbidden.status).toBe(403);
    const unchanged = await prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } });
    expect(unchanged.taxId).toBe('900300300-3');
    expect(unchanged.name).toBe('Proveedor inicial');

    const ordinary = await request(app.getHttpServer())
      .put('/api/v1/suppliers/' + supplier.id)
      .set('Cookie', [comprasCookie])
      .send({ name: 'Proveedor permitido' });

    expect(ordinary.status).toBe(200);
    expect(ordinary.body.name).toBe('Proveedor permitido');
  });

  it('DELETE /api/v1/suppliers/:id — inactiva lógicamente al proveedor', async () => {
    const created = await prisma.supplier.create({
      data: {
        taxId: '900555666-2',
        name: 'Proveedor Para Inactivar',
      },
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/suppliers/${created.id}`)
      .set('Cookie', [adminCookie]);

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);

    const inDb = await prisma.supplier.findUnique({
      where: { id: created.id },
    });
    expect(inDb?.isActive).toBe(false);
  });
});
