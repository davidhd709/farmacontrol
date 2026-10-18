import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { cleanTestDatabase, prisma, Prisma, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

const period = { fromDate: '2026-09-15', toDate: '2026-09-15' };
const inPeriod = new Date('2026-09-15T15:00:00Z');

describe('T-32/T-33/T-34: reportes exactos con PostgreSQL real', () => {
  let app: INestApplication;
  let adminCookie: string;
  let noPermissionCookie: string;
  let userId: string;
  let categoryId: string;
  let customerId: string;
  let sequence: number;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
    const user = await app.get(UserProvisioningService).provisionInitialUser({
      username: 'admin_top_reports',
      password: 'AdminPassword123!',
    });
    userId = user.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId, roleId: adminRole.id } });
    await prisma.user.create({ data: { username: 'no_reports', passwordHash: user.passwordHash } });
    const auth = app.get(AuthService);
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('admin_top_reports', 'AdminPassword123!')).rawToken}`;
    noPermissionCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('no_reports', 'AdminPassword123!')).rawToken}`;
    categoryId = (await prisma.category.create({ data: { name: 'Reportes' } })).id;
    customerId = (
      await prisma.customer.create({
        data: { name: 'Cliente', documentType: 'CC', documentNumber: '123456' },
      })
    ).id;
    sequence = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  function get(path: string) {
    return request(app.getHttpServer()).get(`/api/v1/reports/${path}`).set('Cookie', adminCookie);
  }

  function product(code: string, cost = '0.10', price = '0.20') {
    return prisma.product.create({
      data: { categoryId, code, name: code, baseUnit: 'TAB', baseCost: cost, basePrice: price },
    });
  }

  async function sale(
    lines: {
      productId: string;
      units: number;
      total: string;
      presentationId?: string;
      factor?: number;
      commercial?: number;
    }[],
    status = 'COMPLETED',
    createdAt = inPeriod,
    paymentMethod = 'EFECTIVO',
  ) {
    const total = lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0));
    return prisma.sale.create({
      data: {
        customerId,
        createdById: userId,
        invoiceNumber: `REPORT-${++sequence}`,
        status,
        createdAt,
        paymentMethod,
        subtotal: total,
        total,
        lines: {
          create: lines.map((line) => ({
            productId: line.productId,
            quantityBaseUnits: line.units,
            quantityCommercial: line.commercial ?? line.units,
            presentationId: line.presentationId,
            presentationFactorHistorical: line.factor ?? 1,
            unitPrice: line.total,
            subtotal: line.total,
            total: line.total,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async function credit(
    s: Awaited<ReturnType<typeof sale>>,
    units: number,
    value: string,
    createdAt = inPeriod,
  ) {
    return prisma.creditNote.create({
      data: {
        creditNoteNumber: `NC-${++sequence}`,
        saleId: s.id,
        customerId,
        createdById: userId,
        reason: 'Devolución',
        subtotal: value,
        total: value,
        createdAt,
        lines: {
          create: {
            saleLineId: s.lines[0].id,
            productId: s.lines[0].productId,
            quantityBaseUnits: units,
            quantityCommercial: units,
            unitPrice: value,
            subtotal: value,
            total: value,
          },
        },
      },
    });
  }

  it('T-32: costo 10.000.000, precio 13.000.000 y margen 3.000.000 desde lotes reales', async () => {
    const p = await product('MARGEN', '10000', '13000');
    const location = await prisma.location.create({ data: { code: 'L', name: 'Local' } });
    await prisma.inventoryLot.create({
      data: {
        productId: p.id,
        locationId: location.id,
        lotNumber: 'LOT',
        expirationDate: new Date('2028-01-01'),
        currentQuantity: 1000,
      },
    });
    const res = await get('inventory-valuation').expect(200);
    expect(res.body.data).toMatchObject({
      totalCostValuation: 10000000,
      totalPriceValuation: 13000000,
      totalPotentialMargin: 3000000,
      productsWithValuationIssues: 0,
    });
    expect(res.body.data.items[0]).toMatchObject({
      potentialMargin: 3000000,
      valuationIssue: null,
    });
  });

  it('T-32: identifica costo/precio faltantes, excluye sus márgenes y sólo cuenta issues con stock', async () => {
    const location = await prisma.location.create({ data: { code: 'L', name: 'Local' } });
    const cases = [
      ['COMPLETE-A', '0.10', '0.20', null, 0.1],
      ['COMPLETE-B', '0.20', '0.40', null, 0.2],
      ['NO-COST', '0', '5', 'MISSING_COST', null],
      ['NO-PRICE', '5', '0', 'MISSING_PRICE', null],
      ['NEITHER', '0', '0', 'MISSING_COST_AND_PRICE', null],
    ] as const;
    for (const [code, cost, price] of cases) {
      const p = await product(code, cost, price);
      await prisma.inventoryLot.create({
        data: {
          productId: p.id,
          locationId: location.id,
          lotNumber: code,
          expirationDate: new Date('2028-01-01'),
          currentQuantity: 1,
        },
      });
    }
    await product('NO-STOCK', '0', '0');
    const res = await get('inventory-valuation').expect(200);
    expect(res.body.data.totalPotentialMargin).toBe(0.3);
    expect(res.body.data.productsWithValuationIssues).toBe(3);
    for (const [code, , , issue, margin] of cases) {
      expect(
        res.body.data.items.find((i: { productCode: string }) => i.productCode === code),
      ).toMatchObject({ potentialMargin: margin, valuationIssue: issue });
    }
    const csv = await get('inventory-valuation?format=csv').expect(200);
    expect(csv.text).toContain('Margen Potencial ($),Observación');
    expect(csv.text).toContain(',,Sin costo,');
    expect(csv.text).toContain(',,Sin precio,');
    expect(csv.text).toContain(',,Sin costo ni precio,');
  });

  it('T-33: excluye anuladas del conteo, importes, medios de pago y detalle; suma 0.10 + 0.20 exactamente', async () => {
    const p = await product('SALES');
    const first = await sale([{ productId: p.id, units: 1, total: '0.10' }]);
    const second = await sale([{ productId: p.id, units: 1, total: '0.20' }]);
    await sale([{ productId: p.id, units: 100, total: '9999' }], 'CANCELLED', inPeriod, 'TARJETA');
    const res = await get('sales').query(period).expect(200);
    expect(res.body.data).toMatchObject({
      totalSales: 2,
      totalAmount: 0.3,
      byPaymentMethod: { EFECTIVO: 0.3 },
    });
    expect(res.body.data.byPaymentMethod).not.toHaveProperty('TARJETA');
    expect(res.body.data.items.map((i: { saleId: string }) => i.saleId).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  it('caja: suma ingresos 0.10 + 0.20 y resta egresos con centavos exactos', async () => {
    for (const [movementType, amount, balanceAfter] of [
      ['INGRESO_MANUAL', '0.10', '0.10'],
      ['INGRESO_VENTA', '0.20', '0.30'],
      ['EGRESO_MANUAL', '0.10', '0.20'],
    ])
      await prisma.cashMovement.create({
        data: {
          movementType,
          reason: 'Prueba de sumas exactas',
          amount,
          balanceAfter,
          paymentMethod: 'EFECTIVO',
          createdByUserId: userId,
          createdAt: inPeriod,
        },
      });
    const res = await get('cash-summary').query(period).expect(200);
    expect(res.body.data).toMatchObject({
      totalInflows: 0.3,
      totalOutflows: 0.1,
      netCashFlow: 0.2,
    });
  });

  async function rankingFixtures() {
    const a = await product('A');
    const blister = await prisma.productPresentation.create({
      data: { productId: a.id, name: 'Blíster', conversionFactor: 10, price: '0.20' },
    });
    const box = await prisma.productPresentation.create({
      data: { productId: a.id, name: 'Caja', conversionFactor: 20, price: '3.00' },
    });
    const s = await sale([
      { productId: a.id, units: 1, total: '0.10' },
      {
        productId: a.id,
        units: 10,
        total: '0.20',
        presentationId: blister.id,
        factor: 10,
        commercial: 1,
      },
      {
        productId: a.id,
        units: 20,
        total: '3.00',
        presentationId: box.id,
        factor: 20,
        commercial: 1,
      },
    ]);
    const extra = await sale([{ productId: a.id, units: 1, total: '0.10' }]);
    await credit(extra, 1, '0.10');
    await credit(s, 1, '0.10');
    await credit(s, 1, '0.10', new Date('2026-09-16T05:00:00Z'));
    for (const [code, units] of [
      ['B', 30],
      ['C', 20],
      ['D', 20],
    ] as const) {
      const p = await product(code);
      await sale([{ productId: p.id, units, total: '4.00' }]);
    }
    const cancelledOnly = await product('CANCELLED');
    await sale([{ productId: cancelledOnly.id, units: 9999, total: '9999' }], 'CANCELLED');
    await sale([{ productId: a.id, units: 9999, total: '9999' }], 'CANCELLED');
  }

  it('T-34: consolida unidad/blíster/caja, cuenta ventas distintas, descuenta notas y ordena unidades/valor/código', async () => {
    await rankingFixtures();
    const res = await get('top-products').query(period).expect(200);
    expect(res.body.data).toMatchObject({ ...period, sortBy: 'units', limit: 20 });
    expect(res.body.data.items.map((i: { productCode: string }) => i.productCode)).toEqual([
      'B',
      'A',
      'C',
      'D',
    ]);
    expect(res.body.data.items[1]).toMatchObject({
      rank: 2,
      soldBaseUnits: 32,
      returnedBaseUnits: 2,
      netBaseUnits: 30,
      soldValue: 3.4,
      returnedValue: 0.2,
      netValue: 3.2,
      salesCount: 2,
    });
    const byValue = await get('top-products')
      .query({ ...period, sortBy: 'value', limit: 3 })
      .expect(200);
    expect(
      byValue.body.data.items.map((i: { productCode: string; rank: number }) => [
        i.productCode,
        i.rank,
      ]),
    ).toEqual([
      ['B', 1],
      ['C', 2],
      ['D', 3],
    ]);
  });

  it('T-34: filtra por día de negocio inclusivo y por fecha de nota, incluso de ventas anteriores', async () => {
    const p = await product('BOUNDARY');
    const old = await sale(
      [{ productId: p.id, units: 1, total: '0.10' }],
      'COMPLETED',
      new Date('2026-09-15T04:59:59.999Z'),
    );
    await credit(old, 1, '0.10');
    await sale(
      [{ productId: p.id, units: 2, total: '0.20' }],
      'COMPLETED',
      new Date('2026-09-15T05:00:00Z'),
    );
    await sale(
      [{ productId: p.id, units: 3, total: '0.30' }],
      'COMPLETED',
      new Date('2026-09-16T04:59:59.999Z'),
    );
    await sale(
      [{ productId: p.id, units: 100, total: '100' }],
      'COMPLETED',
      new Date('2026-09-16T05:00:00Z'),
    );
    const res = await get('top-products').query(period).expect(200);
    expect(res.body.data.items[0]).toMatchObject({
      soldBaseUnits: 5,
      returnedBaseUnits: 1,
      netBaseUnits: 4,
      soldValue: 0.5,
      returnedValue: 0.1,
      netValue: 0.4,
      salesCount: 2,
    });
    const fromOnly = await get('top-products').query({ fromDate: '2026-09-16' }).expect(200);
    expect(fromOnly.body.data.items[0].soldBaseUnits).toBe(100);
    const toOnly = await get('top-products').query({ toDate: '2026-09-14' }).expect(200);
    expect(toOnly.body.data.items[0].soldBaseUnits).toBe(1);
  });

  it('T-34: período sin ventas o sólo devoluciones devuelve items vacío', async () => {
    const p = await product('OLD');
    const old = await sale(
      [{ productId: p.id, units: 1, total: '0.10' }],
      'COMPLETED',
      new Date('2026-09-14T15:00:00Z'),
    );
    await credit(old, 1, '0.10');
    const res = await get('top-products').query(period).expect(200);
    expect(res.body.data.items).toEqual([]);
    const empty = await get('top-products')
      .query({ fromDate: '2025-01-01', toDate: '2025-01-31' })
      .expect(200);
    expect(empty.body.data.items).toEqual([]);
  });

  it.each([
    'sortBy=invalid',
    'sortBy=units&sortBy=value',
    'limit=0',
    'limit=101',
    'limit=-1',
    'limit=1.5',
    'limit=abc',
    'limit=',
    'limit=9007199254740993',
    'limit=1&limit=2',
    'fromDate=invalid',
    'toDate=invalid',
  ])('T-34: rechaza query inválida %s', async (query) => {
    await get(`top-products?${query}`).expect(400);
  });

  it.each([1, 100])('T-34: admite límite %s', async (limit) => {
    const res = await get('top-products').query({ limit }).expect(200);
    expect(res.body.data.limit).toBe(limit);
  });

  it('T-34: requiere reports:read', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reports/top-products')
      .set('Cookie', noPermissionCookie)
      .expect(403);
  });

  it('T-34: exporta encabezados en español, importes y texto neutralizado contra fórmulas', async () => {
    const p = await product('=FORMULA');
    await sale([{ productId: p.id, units: 1, total: '0.10' }]);
    const res = await get('top-products')
      .query({ ...period, format: 'csv' })
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain(
      'Posición,Código,Producto,Unidad Base,Unidades Vendidas,Unidades Devueltas,Unidades Netas,Valor Vendido ($),Valor Devuelto ($),Valor Neto ($),Ventas',
    );
    expect(res.text).toContain("1,'=FORMULA,'=FORMULA,TAB,1,0,1,0.10,0.00,0.10,1");
  });
});
