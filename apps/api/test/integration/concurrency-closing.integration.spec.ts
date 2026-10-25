import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/**
 * Concurrencia de cierre (Fase 6): carreras que todavía no tenían prueba con PostgreSQL real.
 */
describe('Concurrencia de cierre: compras, notas crédito y consecutivos (PostgreSQL real)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;
  let adminCookie: string;
  let supplierId: string;
  let productId: string;

  const expiration = new Date();
  expiration.setFullYear(expiration.getFullYear() + 2);
  const expirationDate = expiration.toISOString().slice(0, 10);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

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

    // Compras, ventas y notas crédito contabilizan en la misma transacción: sin mapeos se rechazan
    const accountingMappings = [
      { purpose: 'CASH', code: '110505', type: 'ASSET' },
      { purpose: 'BANK', code: '111005', type: 'ASSET' },
      { purpose: 'CUSTOMERS', code: '130505', type: 'ASSET' },
      { purpose: 'INVENTORY', code: '143501', type: 'ASSET' },
      { purpose: 'SUPPLIERS', code: '220505', type: 'LIABILITY' },
      { purpose: 'VAT_OUTPUT', code: '240805', type: 'LIABILITY' },
      { purpose: 'VAT_INPUT', code: '240810', type: 'ASSET' },
      { purpose: 'SALES_TAXED', code: '413501', type: 'INCOME' },
      { purpose: 'SALES_EXCLUDED', code: '413502', type: 'INCOME' },
      { purpose: 'SALES_DISCOUNTS', code: '417506', type: 'INCOME' },
      { purpose: 'SALES_RETURNS', code: '417505', type: 'INCOME' },
      { purpose: 'COST_OF_SALES', code: '613501', type: 'COST' },
    ] as const;
    for (const mapping of accountingMappings) {
      const account = await prisma.account.create({
        data: {
          code: mapping.code,
          name: mapping.purpose,
          type: mapping.type,
          level: 1,
          allowsMovement: true,
        },
      });
      await prisma.companyAccountingMapping.create({
        data: {
          purpose: mapping.purpose,
          accountId: account.id,
          status: 'ACTIVE',
          effectiveFrom: new Date('2020-01-01T00:00:00Z'),
        },
      });
    }

    const admin = await provisioningService.provisionInitialUser({
      username: 'concurrency_admin',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    const login = await authService.login('concurrency_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;

    supplierId = (
      await prisma.supplier.create({ data: { taxId: '900111222-3', name: 'Proveedor Carrera' } })
    ).id;
    const category = await prisma.category.create({ data: { name: 'Concurrencia' } });
    productId = (
      await prisma.product.create({
        data: {
          inventoryControlMode: 'LOT_EXPIRY',
          categoryId: category.id,
          code: 'CONC-01',
          name: 'Producto Carrera',
          basePrice: 1000,
          baseCost: 400,
        },
      })
    ).id;
    await prisma.location.create({ data: { code: 'BOD-1', name: 'Bodega', isDefault: true } });
    // Las ventas sin cliente usan el Consumidor Final, que crea la instalación
    await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final',
        isDefault: true,
      },
    });
  }, 30000);

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
  });

  const receive = (invoiceNumber: string, quantity: number) =>
    request(app.getHttpServer())
      .post('/api/v1/purchases/receive')
      .set('Cookie', adminCookie)
      .send({
        supplierId,
        invoiceNumber,
        purchaseDate: today,
        paymentCondition: 'CONTADO',
        lines: [
          {
            productId,
            lotNumber: 'LOTE-CARRERA',
            expirationDate,
            quantityCommercial: quantity,
            unitCost: 400,
          },
        ],
      });

  const sell = (quantity: number) =>
    request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        paymentMethod: 'EFECTIVO',
        amountPaid: quantity * 1000,
        items: [{ productId, quantityCommercial: quantity }],
      });

  it('compras simultáneas sobre el mismo lote suman todo y encadenan el kardex', async () => {
    await receive('FAC-BASE', 10).expect(201);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => receive(`FAC-CONC-${i + 1}`, 20)),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);

    const lot = await prisma.inventoryLot.findFirstOrThrow({
      where: { productId, lotNumber: 'LOTE-CARRERA' },
    });
    expect(lot.currentQuantity).toBe(110);

    // Cada entrada parte del saldo que dejó la anterior: sin saldos repetidos ni perdidos
    const movements = await prisma.inventoryMovement.findMany({
      where: { lotId: lot.id },
      orderBy: { balanceAfterBaseUnits: 'asc' },
    });
    expect(movements.map((m) => m.balanceAfterBaseUnits)).toEqual([10, 30, 50, 70, 90, 110]);
  });

  it('notas crédito simultáneas de una venta nunca devuelven más de lo vendido', async () => {
    await receive('FAC-STOCK', 50).expect(201);
    const sale = await sell(10).expect(201);
    const saleLineId = sale.body.lines[0].id;

    // Cuatro devoluciones de 4 unidades sobre 10 vendidas: a lo sumo dos caben
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/sales/${sale.body.id}/credit-notes`)
          .set('Cookie', adminCookie)
          .set('Idempotency-Key', randomUUID())
          .send({
            reason: 'Devolución simultánea de prueba',
            refundMethod: 'EFECTIVO',
            restock: true,
            items: [{ saleLineId, quantityCommercial: 4 }],
          }),
      ),
    );
    const accepted = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 409 || r.status === 400).length;
    expect(accepted).toBe(2);
    expect(accepted + rejected).toBe(4);

    const returned = await prisma.creditNoteLine.aggregate({
      where: { saleLineId },
      _sum: { quantityBaseUnits: true },
    });
    expect(returned._sum.quantityBaseUnits).toBe(8);
    const lot = await prisma.inventoryLot.findFirstOrThrow({ where: { productId } });
    expect(lot.currentQuantity).toBe(50 - 10 + 8);
  });

  it('ventas simultáneas reciben comprobantes distintos y consecutivos', async () => {
    await receive('FAC-VENTAS', 100).expect(201);

    const results = await Promise.all(Array.from({ length: 8 }, () => sell(1)));
    expect(results.every((r) => r.status === 201)).toBe(true);

    const numbers = results.map((r) => r.body.invoiceNumber as string).sort();
    expect(new Set(numbers).size).toBe(8);
    expect(numbers).toEqual(
      Array.from({ length: 8 }, (_, i) => `FAC-${String(i + 1).padStart(6, '0')}`),
    );
  });
});
