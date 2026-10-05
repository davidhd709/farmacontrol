import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('ThirdPartyController (Integration with PostgreSQL & RBAC)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let adminCookie: string;
  let noPermCookie: string;

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

    // 1. Admin inicial con rol admin
    const admin = await provisioningService.provisionInitialUser({
      username: 'tp_admin',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: {
        userId: admin.id!,
        roleId: adminRole.id,
      },
    });

    const adminLogin = await authService.login('tp_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    // 2. Usuario sin permisos de gestión de terceros
    const noPermUser = await prisma.user.create({
      data: {
        username: 'tp_sin_permiso',
        passwordHash: admin.passwordHash,
        isActive: true,
      },
    });
    const noPermRole = await prisma.role.create({
      data: {
        name: 'rol_sin_permisos_tp',
        description: 'Rol sin permisos sobre terceros',
      },
    });
    await prisma.userRole.create({
      data: {
        userId: noPermUser.id,
        roleId: noPermRole.id,
      },
    });
    const noPermLogin = await authService.login('tp_sin_permiso', 'AdminPassword#2026');
    noPermCookie = `${SESSION_COOKIE_NAME}=${noPermLogin.rawToken}`;
  });

  it('debe registrar un tercero unificado (cliente y proveedor) y sincronizar sus entidades', async () => {
    const payload = {
      personType: 'JURIDICA',
      documentType: 'NIT',
      documentNumber: '900987654',
      verificationDigit: '3',
      name: 'Droguerías Aliadas de Colombia S.A.S.',
      tradeName: 'Droguerías Aliadas',
      contactName: 'María Fernanda Ruiz',
      phone: '3001234567',
      email: 'contacto@aliadas.com',
      address: 'Calle 50 # 45-20',
      city: 'Medellín',
      department: 'Antioquia',
      taxRegime: 'RESPONSABLE_IVA',
      isCustomer: true,
      isSupplier: true,
      isEmployee: false,
      isOther: false,
      notes: 'Tercero mixto: cliente mayorista y proveedor de insumos',
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/third-parties')
      .set('Cookie', adminCookie)
      .send(payload)
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.documentNumber).toBe('900987654');
    expect(res.body.verificationDigit).toBe('3');
    expect(res.body.name).toBe('Droguerías Aliadas de Colombia S.A.S.');
    expect(res.body.isCustomer).toBe(true);
    expect(res.body.isSupplier).toBe(true);
    expect(res.body.customerId).toBeDefined();
    expect(res.body.supplierId).toBeDefined();

    // Comprobar que en PostgreSQL se sincronizó tanto en customers como en suppliers
    const syncedCust = await prisma.customer.findUnique({
      where: { documentNumber: '900987654' },
    });
    expect(syncedCust).not.toBeNull();
    expect(syncedCust?.name).toBe('Droguerías Aliadas de Colombia S.A.S.');

    const syncedSupp = await prisma.supplier.findUnique({
      where: { taxId: '900987654' },
    });
    expect(syncedSupp).not.toBeNull();
    expect(syncedSupp?.name).toBe('Droguerías Aliadas de Colombia S.A.S.');
  });

  it('debe listar terceros con filtro por rol y búsqueda textual', async () => {
    // Crear un empleado
    await request(app.getHttpServer())
      .post('/api/v1/third-parties')
      .set('Cookie', adminCookie)
      .send({
        personType: 'NATURAL',
        documentType: 'CC',
        documentNumber: '1098765432',
        name: 'Ana Sofía Martínez',
        phone: '3119876543',
        email: 'ana.martinez@farmacia.com',
        isCustomer: false,
        isSupplier: false,
        isEmployee: true,
      })
      .expect(201);

    // Listar todos
    const resAll = await request(app.getHttpServer())
      .get('/api/v1/third-parties')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(resAll.body.total).toBeGreaterThanOrEqual(1);

    // Filtrar por rol EMPLOYEE
    const resEmp = await request(app.getHttpServer())
      .get('/api/v1/third-parties?role=EMPLOYEE')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(resEmp.body.items).toHaveLength(1);
    expect(resEmp.body.items[0].documentNumber).toBe('1098765432');
    expect(resEmp.body.items[0].isEmployee).toBe(true);

    // Buscar por texto
    const resSearch = await request(app.getHttpServer())
      .get('/api/v1/third-parties?search=Sofía')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(resSearch.body.items).toHaveLength(1);
    expect(resSearch.body.items[0].name).toBe('Ana Sofía Martínez');
  });

  it('debe actualizar información y permitir inactivar y reactivar al tercero', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/third-parties')
      .set('Cookie', adminCookie)
      .send({
        documentType: 'CC',
        documentNumber: '44556677',
        name: 'Roberto Gómez',
        isCustomer: true,
      })
      .expect(201);

    const tpId = created.body.id;

    // Actualizar teléfono y dirección
    const updated = await request(app.getHttpServer())
      .put(`/api/v1/third-parties/${tpId}`)
      .set('Cookie', adminCookie)
      .send({
        phone: '3209998877',
        address: 'Carrera 10 # 20-30',
        city: 'Montería',
      })
      .expect(200);

    expect(updated.body.phone).toBe('3209998877');
    expect(updated.body.city).toBe('Montería');

    // Inactivar
    const deactivated = await request(app.getHttpServer())
      .patch(`/api/v1/third-parties/${tpId}/deactivate`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(deactivated.body.isActive).toBe(false);

    // Reactivar
    const reactivated = await request(app.getHttpServer())
      .patch(`/api/v1/third-parties/${tpId}/activate`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(reactivated.body.isActive).toBe(true);
  });

  it('debe rechazar acceso a usuarios sin permisos (403 Forbidden)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/third-parties')
      .set('Cookie', noPermCookie)
      .send({
        documentType: 'CC',
        documentNumber: '999888777',
        name: 'Test No Permission',
      })
      .expect(403);
  });
});
