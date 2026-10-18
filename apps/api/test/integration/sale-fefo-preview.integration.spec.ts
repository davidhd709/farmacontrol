import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

const PATH = '/api/v1/sales/fefo-preview';
const DAY = '2026-10-10';

describe('POST sales/fefo-preview (PostgreSQL real)', () => {
  let app: INestApplication;
  let provisioning: UserProvisioningService;
  let auth: AuthService;
  let cookie: string;
  let deniedCookie: string;
  let productId: string;
  let presentationId: string;
  let earlyId: string;
  let tiedId: string;
  let lateId: string;

  const preview = (items: unknown[], session = cookie) =>
    request(app.getHttpServer()).post(PATH).set('Cookie', session).send({ items });
  const item = (quantityCommercial: number, withPresentation = false) => ({
    productId,
    ...(withPresentation ? { presentationId } : {}),
    quantityCommercial,
  });

  beforeAll(async () => {
    // A esta hora UTC ya es el día siguiente; Bogotá sigue en DAY.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${DAY}T23:30:00-05:00`));
    await cleanTestDatabase();
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    provisioning = fixture.get(UserProvisioningService);
    auth = fixture.get(AuthService);
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
    const user = await provisioning.provisionInitialUser({
      username: 'fefo_cashier',
      password: 'FefoPassword#2026',
    });
    // Asegurar que la prueba usa sólo permisos del cajero, sin admin inicial.
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    const cashier = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: user.id!, roleId: cashier.id } });
    cookie = `${SESSION_COOKIE_NAME}=${(await auth.login('fefo_cashier', 'FefoPassword#2026')).rawToken}`;
    await prisma.user.create({
      data: {
        username: 'fefo_denied',
        passwordHash: user.passwordHash,
        isActive: true,
      },
    });
    deniedCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('fefo_denied', 'FefoPassword#2026')).rawToken}`;

    const category = await prisma.category.create({ data: { name: 'FEFO' } });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'FEFO-TEST',
        name: 'Producto FEFO',
        baseUnit: 'TABLETA',
        basePrice: '500.00',
        baseCost: '300.00',
        requiresLotControl: true,
      },
    });
    productId = product.id;
    const presentation = await prisma.productPresentation.create({
      data: {
        productId,
        name: 'Caja x 10',
        conversionFactor: 10,
        price: '4800.00',
        cost: '2800.00',
      },
    });
    presentationId = presentation.id;
    const location = await prisma.location.create({ data: { code: 'FEFO', name: 'Principal' } });
    // Insertar primero el de vencimiento posterior para probar ORDER BY, no orden de inserción.
    const lots = [
      {
        lotNumber: 'LATE',
        expirationDate: new Date('2026-11-10'),
        currentQuantity: 20,
        createdAt: new Date('2026-01-01'),
      },
      {
        lotNumber: 'TIED',
        expirationDate: new Date(DAY),
        currentQuantity: 5,
        createdAt: new Date('2026-01-02'),
      },
      {
        lotNumber: 'EARLY',
        expirationDate: new Date(DAY),
        currentQuantity: 10,
        createdAt: new Date('2026-01-01'),
      },
      { lotNumber: 'EXPIRED', expirationDate: new Date('2026-10-09'), currentQuantity: 100 },
      {
        lotNumber: 'INACTIVE',
        expirationDate: new Date(DAY),
        currentQuantity: 100,
        isActive: false,
      },
      { lotNumber: 'EMPTY', expirationDate: new Date(DAY), currentQuantity: 0 },
    ];
    for (const data of lots) {
      const lot = await prisma.inventoryLot.create({
        data: { productId, locationId: location.id, ...data },
      });
      if (data.lotNumber === 'EARLY') earlyId = lot.id;
      if (data.lotNumber === 'TIED') tiedId = lot.id;
      if (data.lotNumber === 'LATE') lateId = lot.id;
    }
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanTestDatabase();
    if (app) await app.close();
  });

  it('ordena por vencimiento y creación, incluye hoy Bogotá y excluye vencidos, inactivos y vacíos', async () => {
    const res = await preview([item(2, true)]).expect(200);
    expect(res.body).toEqual({
      businessDay: DAY,
      lines: [
        {
          productId,
          presentationId,
          requiredBaseUnits: 20,
          availableBaseUnits: 35,
          shortfallBaseUnits: 0,
          allocations: [
            { lotId: earlyId, lotNumber: 'EARLY', expirationDate: DAY, quantityBaseUnits: 10 },
            { lotId: tiedId, lotNumber: 'TIED', expirationDate: DAY, quantityBaseUnits: 5 },
            {
              lotId: lateId,
              lotNumber: 'LATE',
              expirationDate: '2026-11-10',
              quantityBaseUnits: 5,
            },
          ],
        },
      ],
    });
  });

  it('acumula líneas del mismo producto, conserva orden y devuelve faltante parcial', async () => {
    const res = await preview([item(2, true), item(2, true), item(1)]).expect(200);
    expect(res.body.lines.map((l: { availableBaseUnits: number }) => l.availableBaseUnits)).toEqual(
      [35, 15, 0],
    );
    expect(res.body.lines.map((l: { shortfallBaseUnits: number }) => l.shortfallBaseUnits)).toEqual(
      [0, 5, 1],
    );
    expect(res.body.lines[1].allocations).toEqual([
      { lotId: lateId, lotNumber: 'LATE', expirationDate: '2026-11-10', quantityBaseUnits: 15 },
    ]);
    expect(res.body.lines[2]).toMatchObject({
      presentationId: null,
      requiredBaseUnits: 1,
      allocations: [],
    });
  });

  it('devuelve asignación parcial sin convertir el faltante en error', async () => {
    const res = await preview([item(4, true)]).expect(200);
    expect(res.body.lines[0]).toMatchObject({
      requiredBaseUnits: 40,
      availableBaseUnits: 35,
      shortfallBaseUnits: 5,
    });
    expect(res.body.lines[0].allocations).toHaveLength(3);
  });

  it('no modifica lotes, kardex, ventas, auditoría ni idempotencia y no reserva en consultas repetidas', async () => {
    const snapshot = async () => ({
      lots: await prisma.inventoryLot.findMany({ orderBy: { id: 'asc' } }),
      movements: await prisma.inventoryMovement.count(),
      sales: await prisma.sale.count(),
      audit: await prisma.auditEvent.count(),
      idempotency: await prisma.idempotencyKey.count(),
    });
    const before = await snapshot();
    const first = await preview([item(4, true)]).expect(200);
    const second = await preview([item(4, true)]).expect(200);
    expect(second.body).toEqual(first.body);
    expect(await snapshot()).toEqual(before);
  });

  it('rechaza producto sin control de lote con 4xx', async () => {
    await prisma.product.update({ where: { id: productId }, data: { requiresLotControl: false } });
    const res = await preview([item(1)]).expect(409);
    expect(res.body.message).toContain('control por lote');
  });

  it('rechaza producto inactivo o inexistente', async () => {
    await prisma.product.update({ where: { id: productId }, data: { isActive: false } });
    await preview([item(1)]).expect(400);
    await preview([{ productId: randomUUID(), quantityCommercial: 1 }]).expect(400);
  });

  it('rechaza presentaciones ajenas, inexistentes, inactivas o no habilitadas para venta', async () => {
    await preview([{ ...item(1), presentationId: randomUUID() }]).expect(400);
    await prisma.productPresentation.update({
      where: { id: presentationId },
      data: { isActive: false },
    });
    await preview([item(1, true)]).expect(400);
    await prisma.productPresentation.update({
      where: { id: presentationId },
      data: { isActive: true, saleEnabled: false },
    });
    await preview([item(1, true)]).expect(400);
    const other = await prisma.product.create({
      data: {
        categoryId: (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
          .categoryId,
        code: 'OTHER',
        name: 'Otro',
        baseUnit: 'TABLETA',
        basePrice: '100',
        baseCost: '50',
        requiresLotControl: true,
      },
    });
    await prisma.productPresentation.update({
      where: { id: presentationId },
      data: { saleEnabled: true, productId: other.id },
    });
    await preview([item(1, true)]).expect(400);
  });

  it('rechaza unidades base fraccionarias y permite fracción comercial que equivale a unidades enteras', async () => {
    await preview([item(0.5)]).expect(400);
    const res = await preview([item(0.5, true)]).expect(200);
    expect(res.body.lines[0].requiredBaseUnits).toBe(5);
  });

  it('exige sales:create (403) y sesión (401)', async () => {
    await preview([item(1)], deniedCookie).expect(403);
    await request(app.getHttpServer())
      .post(PATH)
      .send({ items: [item(1)] })
      .expect(401);
  });

  it('valida forma, límite 1..100, UUID y cantidades positivas finitas', async () => {
    for (const body of [
      null,
      [],
      {},
      { items: [] },
      { items: Array.from({ length: 101 }, () => item(1)) },
    ]) {
      await request(app.getHttpServer()).post(PATH).set('Cookie', cookie).send(body).expect(400);
    }
    for (const invalid of [
      null,
      [],
      { ...item(1), productId: 'invalid' },
      { ...item(1), presentationId: 'invalid' },
      item(0),
      item(-1),
      { ...item(1), quantityCommercial: '1' },
      { ...item(1), quantityCommercial: null },
    ]) {
      await preview([invalid]).expect(400);
    }
    const res = await preview(Array.from({ length: 100 }, () => item(1))).expect(200);
    expect(res.body.lines).toHaveLength(100);
    await preview([{ ...item(1), presentationId: null }]).expect(200);
  });

  it('documenta el endpoint en OpenAPI con request, respuesta y errores', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('FEFO').setVersion('1').build(),
    );
    const endpoint = doc.paths[PATH]?.post;
    expect(endpoint?.requestBody).toBeDefined();
    expect(Object.keys(endpoint!.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '409']),
    );
  });
});
