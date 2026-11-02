import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/**
 * Correcciones del cliente, fase 6: la pistola lectora envía el código y Enter; la API
 * responde el producto exacto (código de barras del producto o de la presentación, o código
 * interno) o 404 sin bloquear la venta.
 */
describe('Búsqueda por código de barras', () => {
  let app: INestApplication;
  let cookie: string;
  let productId: string;
  let boxId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await cleanTestDatabase();
    await seedRbac(prisma);
    const provisioning = module.get(UserProvisioningService);
    const auth = module.get(AuthService);
    const cashier = await provisioning.provisionInitialUser({ username: 'cajero_scan', password: 'CajeroPassword#2026' });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id!, roleId: role.id } });
    cookie = `${SESSION_COOKIE_NAME}=${(await auth.login('cajero_scan', 'CajeroPassword#2026')).rawToken}`;

    const category = await prisma.category.create({ data: { name: 'Analgésicos' } });
    productId = (
      await prisma.product.create({
        data: {
          inventoryControlMode: 'LOT_EXPIRY',
          categoryId: category.id,
          code: 'MED-ACE-500',
          barcode: '7702001000017',
          name: 'Acetaminofén 500mg',
          baseUnit: 'TABLETA',
          basePrice: new Prisma.Decimal('500.00'),
          baseCost: new Prisma.Decimal('300.00'),
        },
      })
    ).id;
    boxId = (
      await prisma.productPresentation.create({
        data: {
          productId,
          name: 'Caja x 10',
          barcode: '7702001000024',
          conversionFactor: 10,
          price: new Prisma.Decimal('4500.00'),
        },
      })
    ).id;
  }, 45000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const lookup = (code: string) =>
    request(app.getHttpServer()).get(`/api/v1/products/barcode/${encodeURIComponent(code)}`).set('Cookie', cookie);

  it('encuentra el producto por su código de barras, el de una presentación o el código interno', async () => {
    const byProduct = await lookup('7702001000017').expect(200);
    expect(byProduct.body.product.id).toBe(productId);
    expect(byProduct.body.presentationId).toBeNull();

    const byBox = await lookup('7702001000024').expect(200);
    expect(byBox.body.product.id).toBe(productId);
    expect(byBox.body.presentationId).toBe(boxId);
    expect(byBox.body.product.presentations.map((p: { id: string }) => p.id)).toContain(boxId);

    const byCode = await lookup(' med-ace-500 ').expect(200);
    expect(byCode.body.product.id).toBe(productId);
  });

  it('un código inexistente o parcial responde 404, no otro producto parecido', async () => {
    const missing = await lookup('7702001').expect(404);
    expect(missing.body.message).toMatch(/No existe un producto con el código "7702001"/);
    await lookup('9999999999999').expect(404);
  });
});
