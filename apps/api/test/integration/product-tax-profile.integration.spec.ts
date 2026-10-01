import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { cleanTestDatabase, prisma, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

function dayFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('Product tax profiles 11.3a PostgreSQL', () => {
  let app: INestApplication;
  let adminCookie: string;
  let cashierCookie: string;
  let productId: string;

  beforeAll(async () => {
    await cleanTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 30000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
    const category = await prisma.category.create({ data: { name: 'Prueba fiscal' } });
    const product = await prisma.product.create({
      data: { categoryId: category.id, code: 'SKU-FISCAL', name: 'Producto de prueba', basePrice: '119.00' },
    });
    productId = product.id;
    const provisioning = app.get(UserProvisioningService);
    const auth = app.get(AuthService);
    const admin = await provisioning.provisionInitialUser({
      username: 'tax_admin',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('tax_admin', 'AdminPassword#2026')).rawToken}`;
    const cashier = await prisma.user.create({
      data: { username: 'tax_cashier', passwordHash: admin.passwordHash },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('tax_cashier', 'AdminPassword#2026')).rawToken}`;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 30000);

  function draft(overrides: Record<string, unknown> = {}) {
    return {
      productId,
      operation: 'SALE',
      treatment: 'GRAVADO',
      ratePct: '19.0000',
      effectiveFrom: dayFromNow(10),
      effectiveTo: dayFromNow(20),
      documentReference: 'Validación tributaria del SKU',
      ...overrides,
    };
  }

  const root = '/api/v1/accounting/tax-profiles';
  function create(body: Record<string, unknown>, cookie = adminCookie) {
    return request(app.getHttpServer()).post(root).set('Cookie', cookie).send(body);
  }

  it('permite borradores sin activar impuestos ni modificar ventas existentes', async () => {
    const response = await create(draft());
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('DRAFT');
    expect(response.body.ratePct).toBe('19.0000');
    const effective = await request(app.getHttpServer())
      .get(`${root}/effective`)
      .query({ productId, operation: 'SALE', date: dayFromNow(15) })
      .set('Cookie', adminCookie);
    expect(effective.status).toBe(404);
    expect(await prisma.sale.count()).toBe(0);
    const list = await request(app.getHttpServer())
      .get(root)
      .query({ productId, operation: 'SALE' })
      .set('Cookie', adminCookie);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it('exige autorización, respaldo documental y valida tarifa y vigencia', async () => {
    expect((await create(draft(), cashierCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).get(root).query({ productId })).status).toBe(401);
    expect((await create(draft({ treatment: 'EXCLUIDO', ratePct: '19.0000' }))).status).toBe(400);
    expect((await create(draft({ effectiveTo: dayFromNow(5) }))).status).toBe(400);
    const created = await create(draft({ documentReference: null }));
    expect(created.status).toBe(201);
    const activate = await request(app.getHttpServer())
      .post(`${root}/${created.body.id}/activate`)
      .set('Cookie', adminCookie)
      .send({});
    expect(activate.status).toBe(400);
  });

  it('activa una versión futura, resuelve la vigente e impide superposición', async () => {
    const first = await create(draft());
    expect(first.status).toBe(201);
    const active = await request(app.getHttpServer())
      .post(`${root}/${first.body.id}/activate`)
      .set('Cookie', adminCookie)
      .send({});
    expect(active.status).toBe(201);
    expect(active.body.status).toBe('ACTIVE');
    const effective = await request(app.getHttpServer())
      .get(`${root}/effective`)
      .query({ productId, operation: 'SALE', date: dayFromNow(15) })
      .set('Cookie', adminCookie);
    expect(effective.status).toBe(200);
    expect(effective.body.id).toBe(first.body.id);
    const second = await create(draft({ effectiveFrom: dayFromNow(20), effectiveTo: dayFromNow(30) }));
    expect(second.status).toBe(201);
    const conflict = await request(app.getHttpServer())
      .post(`${root}/${second.body.id}/activate`)
      .set('Cookie', adminCookie)
      .send({});
    expect(conflict.status).toBe(409);
    expect((await prisma.productTaxProfile.count({ where: { status: 'ACTIVE' } })).toString()).toBe('1');
  });
});
