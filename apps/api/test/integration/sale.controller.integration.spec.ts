import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('SaleController (Integration with PostgreSQL, FEFO & Idempotency)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let cajeroCookie: string;
  let supervisorCookie: string;
  let unauthorizedCookie: string;

  let productId: string;
  let presentationId: string;
  let lot1Id: string;
  let lot2Id: string;
  let customerId: string;

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

    // 1. Cliente por defecto y cliente registrado
    await prisma.customer.upsert({
      where: { documentNumber: '222222222222' },
      update: { isDefault: true, isActive: true },
      create: {
        documentType: 'CC',
        documentNumber: '222222222222',
        name: 'Consumidor Final (Cuantías Menores)',
        isDefault: true,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '1030405060',
        name: 'Juan David Pérez',
        isDefault: false,
        isActive: true,
      },
    });
    customerId = customer.id;

    // 2. Producto y Presentación
    const category = await prisma.category.create({
      data: { name: 'Analgésicos', description: 'Medicamentos para el dolor' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'MED-IBU-400',
        name: 'Ibuprofeno 400mg',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('500.00'),
        baseCost: new Prisma.Decimal('300.00'),
        requiresLotControl: true,
      },
    });
    productId = product.id;

    const presentation = await prisma.productPresentation.create({
      data: {
        productId,
        name: 'Caja x 10 Tabletas',
        conversionFactor: 10,
        price: new Prisma.Decimal('4800.00'),
        cost: new Prisma.Decimal('2800.00'),
        isDefault: true,
      },
    });
    presentationId = presentation.id;

    // 3. Ubicación y Lotes FEFO:
    // Lote 1: Vence en 30 días (10 unidades base) -> DEBE DESPACHARSE PRIMERO
    // Lote 2: Vence en 180 días (50 unidades base) -> DEBE COMPLETAR EL PEDIDO
    const location = await prisma.location.create({
      data: { code: 'POS-01', name: 'Estante Principal', isDefault: true },
    });

    const exp1 = new Date();
    exp1.setDate(exp1.getDate() + 30);

    const exp2 = new Date();
    exp2.setDate(exp2.getDate() + 180);

    const lot1 = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId: location.id,
        lotNumber: 'LOTE-FEFO-01',
        expirationDate: exp1,
        currentQuantity: 10,
        isActive: true,
      },
    });
    lot1Id = lot1.id;

    const lot2 = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId: location.id,
        lotNumber: 'LOTE-FEFO-02',
        expirationDate: exp2,
        currentQuantity: 50,
        isActive: true,
      },
    });
    lot2Id = lot2.id;

    // 4. Usuarios y Roles: Cajero (sales:create, sales:read), Admin/Supervisor (sales:cancel)
    const cajeroUser = await provisioningService.provisionInitialUser({
      username: 'pos_cajero',
      password: 'CajeroPassword#2026',
    });
    const cajeroRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({
      data: { userId: cajeroUser.id!, roleId: cajeroRole.id },
    });
    const cajeroLogin = await authService.login('pos_cajero', 'CajeroPassword#2026');
    cajeroCookie = `${SESSION_COOKIE_NAME}=${cajeroLogin.rawToken}`;

    const adminUser = await prisma.user.create({
      data: {
        username: 'pos_admin',
        passwordHash: cajeroUser.passwordHash,
        isActive: true,
      },
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id },
    });
    const adminLogin = await authService.login('pos_admin', 'CajeroPassword#2026');
    supervisorCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;

    const unauth = await prisma.user.create({
      data: {
        username: 'pos_sin_permisos',
        passwordHash: cajeroUser.passwordHash,
        isActive: true,
      },
    });
    const unauthLogin = await authService.login('pos_sin_permisos', 'CajeroPassword#2026');
    unauthorizedCookie = `${SESSION_COOKIE_NAME}=${unauthLogin.rawToken}`;
  }, 30000);

  afterAll(async () => {
    await cleanTestDatabase();
    await app.close();
  });

  it('POST /api/v1/sales/confirm ejecuta la venta con asignación FEFO automática, Kardex y caja', async () => {
    // Se piden 2 cajas = 20 tabletas
    // Lote 1 tiene 10 tabletas (vence antes) -> Se agota (0)
    // Lote 2 tiene 50 tabletas -> Descuenta 10 tabletas (quedan 40)
    const payload = {
      customerId,
      paymentMethod: 'EFECTIVO',
      amountPaid: 10000,
      notes: 'Venta de prueba FEFO',
      items: [
        {
          productId,
          presentationId,
          quantityCommercial: 2, // 2 cajas * $4800 = $9600
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', cajeroCookie)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.invoiceNumber).toMatch(/^FAC-\d{6}$/);
    expect(res.body.total).toBe(9600);
    expect(res.body.changeGiven).toBe(400); // 10000 - 9600 = 400
    expect(res.body.lines).toHaveLength(1);

    const allocations = res.body.lines[0].lotAllocations;
    expect(allocations).toHaveLength(2);
    // Primer lote asignado: LOTE-FEFO-01 con 10 tabletas
    expect(allocations[0].lotNumber).toBe('LOTE-FEFO-01');
    expect(allocations[0].quantityBaseUnits).toBe(10);
    // Segundo lote asignado: LOTE-FEFO-02 con 10 tabletas
    expect(allocations[1].lotNumber).toBe('LOTE-FEFO-02');
    expect(allocations[1].quantityBaseUnits).toBe(10);

    // 1. Verificar saldos en PostgreSQL
    const lot1After = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } });
    expect(lot1After.currentQuantity).toBe(0);

    const lot2After = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot2Id } });
    expect(lot2After.currentQuantity).toBe(40);

    // 2. Verificar movimientos de Kardex
    const movements = await prisma.inventoryMovement.findMany({
      where: { referenceDocumentId: res.body.invoiceNumber },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements).toHaveLength(2);
    expect(movements[0].movementType).toBe('SALIDA_VENTA');
    expect(movements[0].quantityBaseUnits).toBe(10);
    expect(movements[0].balanceAfterBaseUnits).toBe(0);

    expect(movements[1].movementType).toBe('SALIDA_VENTA');
    expect(movements[1].quantityBaseUnits).toBe(10);
    expect(movements[1].balanceAfterBaseUnits).toBe(40);

    // 3. Verificar movimiento en Caja
    const cashMov = await prisma.cashMovement.findFirst({
      where: { referenceDocumentId: res.body.invoiceNumber },
    });
    expect(cashMov).not.toBeNull();
    expect(cashMov?.movementType).toBe('INGRESO_VENTA');
    expect(Number(cashMov?.amount)).toBe(9600);
    expect(Number(cashMov?.balanceAfter)).toBe(9600);
  });

  it('POST /api/v1/sales/confirm respeta la cabecera idempotency-key y no duplica transacciones', async () => {
    const idempotencyKey = 'idem-unique-uuid-999';
    const owner = await prisma.user.findFirstOrThrow({ where: { username: 'pos_admin' } });
    const bank = await prisma.bankAccount.create({
      data: {
        bankName: 'Banco POS',
        accountType: 'AHORROS',
        accountNumber: 'POS-001',
        name: 'Recaudos POS',
        createdById: owner.id,
      },
    });
    const payload = {
      paymentMethod: 'TRANSFERENCIA',
      bankAccountId: bank.id,
      items: [
        {
          productId,
          presentationId,
          quantityCommercial: 1, // 1 caja = 10 unidades
        },
      ],
    };

    // Primera llamada
    const firstRes = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', cajeroCookie)
      .set('idempotency-key', idempotencyKey)
      .send(payload);

    expect(firstRes.status).toBe(201);
    const invoiceNumber = firstRes.body.invoiceNumber;

    // Lote 1 tenía 10 unidades. Se descontaron 10 -> quedan 0.
    const lot1Check = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } });
    expect(lot1Check.currentQuantity).toBe(0);

    // Segunda llamada idéntica con la misma cabecera
    const secondRes = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', cajeroCookie)
      .set('idempotency-key', idempotencyKey)
      .send(payload);

    expect(secondRes.status).toBe(201);
    expect(secondRes.body.invoiceNumber).toBe(invoiceNumber);
    expect(secondRes.body.bankAccountId).toBe(bank.id);
    expect(
      await prisma.bankMovement.count({
        where: { bankAccountId: bank.id, referenceDocumentId: invoiceNumber },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })
      ).currentBalance.toString(),
    ).toBe('4800');

    // El inventario NO debe haberse descontado dos veces
    const lot1AfterSecond = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } });
    expect(lot1AfterSecond.currentQuantity).toBe(0);
  });

  it('AUD-003: exige Idempotency-Key también en ventas en efectivo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', cajeroCookie)
      .send({
        paymentMethod: 'EFECTIVO',
        items: [{ productId, presentationId, quantityCommercial: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Idempotency-Key/);
    expect(await prisma.sale.count()).toBe(0);
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } })).currentQuantity,
    ).toBe(10);
  });

  it('AUD-003: reintentos simultáneos con la misma clave devuelven la misma venta sin duplicarla', async () => {
    const payload = {
      paymentMethod: 'EFECTIVO',
      items: [{ productId, presentationId, quantityCommercial: 1 }],
    };
    const send = () =>
      request(app.getHttpServer())
        .post('/api/v1/sales/confirm')
        .set('Cookie', cajeroCookie)
        .set('Idempotency-Key', 'retry-cash-sale')
        .send(payload);

    const responses = await Promise.all([send(), send(), send()]);

    expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma.sale.count()).toBe(1);
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } })).currentQuantity,
    ).toBe(0);
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot2Id } })).currentQuantity,
    ).toBe(50);
  }, 30000);

  it('AUD-003: otro usuario que reutiliza la clave recibe 409 y no obtiene la venta ajena', async () => {
    const payload = {
      paymentMethod: 'EFECTIVO',
      items: [{ productId, presentationId, quantityCommercial: 1 }],
    };
    const first = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', cajeroCookie)
      .set('Idempotency-Key', 'shared-key-sale')
      .send(payload);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', supervisorCookie)
      .set('Idempotency-Key', 'shared-key-sale')
      .send(payload);

    expect(second.status).toBe(409);
    expect(second.body.id).toBeUndefined();
    expect(await prisma.sale.count()).toBe(1);
  });

  it('rechaza transferencia a cuenta inactiva sin afectar FEFO ni crear venta', async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { username: 'pos_admin' } });
    const bank = await prisma.bankAccount.create({
      data: {
        bankName: 'Banco inactivo',
        accountType: 'AHORROS',
        accountNumber: 'POS-002',
        name: 'Cerrada',
        isActive: false,
        createdById: owner.id,
      },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', cajeroCookie)
      .set('Idempotency-Key', 'inactive-bank-sale')
      .send({
        paymentMethod: 'TRANSFERENCIA',
        bankAccountId: bank.id,
        items: [{ productId, presentationId, quantityCommercial: 1 }],
      });
    expect(res.status).toBe(400);
    expect(await prisma.sale.count()).toBe(0);
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } })).currentQuantity,
    ).toBe(10);
    expect(await prisma.bankMovement.count()).toBe(0);
  });

  it('compara monto de transferencia en centavos aun con sumas decimales 0.10 + 0.20', async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { username: 'pos_admin' } });
    const bank = await prisma.bankAccount.create({
      data: {
        bankName: 'Banco centavos',
        accountType: 'AHORROS',
        accountNumber: 'POS-005',
        name: 'Centavos',
        createdById: owner.id,
      },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', cajeroCookie)
      .set('Idempotency-Key', 'decimal-bank-sale')
      .send({
        paymentMethod: 'TRANSFERENCIA',
        bankAccountId: bank.id,
        amountPaid: 0.3,
        items: [
          { productId, quantityCommercial: 1, unitPriceOverride: 0.1 },
          { productId, quantityCommercial: 1, unitPriceOverride: 0.2 },
        ],
      });
    expect(res.status).toBe(201);
    expect(
      (
        await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })
      ).currentBalance.toString(),
    ).toBe('0.3');
  });

  it('POST /api/v1/sales/confirm rechaza la venta si las existencias son insuficientes (400)', async () => {
    // Disponibles en total entre los dos lotes: 60 tabletas
    // Solicitamos 10 cajas = 100 tabletas
    const payload = {
      paymentMethod: 'EFECTIVO',
      items: [
        {
          productId,
          presentationId,
          quantityCommercial: 10,
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', cajeroCookie)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Existencias insuficientes');
  });

  it('POST /api/v1/sales/:id/cancel anula la venta, reintegra lotes originales y genera egreso en caja', async () => {
    // 1. Confirmar una venta de 1 caja (10 tabletas del lote 1)
    const saleRes = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', cajeroCookie)
      .send({
        paymentMethod: 'EFECTIVO',
        items: [{ productId, presentationId, quantityCommercial: 1 }],
      });
    expect(saleRes.status).toBe(201);

    const saleId = saleRes.body.id;
    const lot1Before = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } });
    expect(lot1Before.currentQuantity).toBe(0); // Se agotó el lote 1

    // 2. Anular la venta con usuario supervisor (sales:cancel)
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/cancel`)
      .set('Cookie', supervisorCookie)
      .send({
        reason: 'Cliente devolvió el producto por receta errónea',
      });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');

    // 3. Verificar que el lote 1 recuperó sus 10 unidades
    const lot1AfterCancel = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } });
    expect(lot1AfterCancel.currentQuantity).toBe(10);

    // 4. Verificar movimiento de egreso en caja
    const lastCash = await prisma.cashMovement.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    expect(lastCash?.movementType).toBe('EGRESO_MANUAL');
    expect(lastCash?.reason).toContain('Reversión por anulación');
    expect(Number(lastCash?.amount)).toBe(4800);
  });

  it('anulación de transferencia revierte banco; si no hay fondos conserva venta y lotes', async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { username: 'pos_admin' } });
    const bank = await prisma.bankAccount.create({
      data: {
        bankName: 'Banco devoluciones',
        accountType: 'AHORROS',
        accountNumber: 'POS-003',
        name: 'Devoluciones',
        createdById: owner.id,
      },
    });
    const saleRes = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', cajeroCookie)
      .set('Idempotency-Key', 'cancel-bank-sale')
      .send({
        paymentMethod: 'TRANSFERENCIA',
        bankAccountId: bank.id,
        items: [{ productId, presentationId, quantityCommercial: 1 }],
      });
    expect(saleRes.status).toBe(201);
    expect(
      (
        await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })
      ).currentBalance.toString(),
    ).toBe('4800');

    await prisma.bankAccount.update({ where: { id: bank.id }, data: { currentBalance: '0.00' } });
    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleRes.body.id}/cancel`)
      .set('Cookie', supervisorCookie)
      .send({ reason: 'Sin fondos para devolver' });
    expect(rejected.status).toBe(400);
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: saleRes.body.id } })).status).toBe(
      'COMPLETED',
    );
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } })).currentQuantity,
    ).toBe(0);
    expect(await prisma.bankMovement.count({ where: { bankAccountId: bank.id } })).toBe(1);

    await prisma.bankAccount.update({
      where: { id: bank.id },
      data: { currentBalance: '4800.00' },
    });
    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/sales/${saleRes.body.id}/cancel`)
      .set('Cookie', supervisorCookie)
      .send({ reason: 'Devolución aprobada' });
    expect(cancelled.status).toBe(200);
    expect(
      (
        await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })
      ).currentBalance.toString(),
    ).toBe('0');
    expect(await prisma.bankMovement.count({ where: { bankAccountId: bank.id } })).toBe(2);
  });

  it('dos anulaciones concurrentes solo restauran FEFO y revierten banco una vez', async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { username: 'pos_admin' } });
    const bank = await prisma.bankAccount.create({
      data: {
        bankName: 'Banco concurrencia',
        accountType: 'AHORROS',
        accountNumber: 'POS-004',
        name: 'Recaudos',
        createdById: owner.id,
      },
    });
    const saleRes = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Cookie', cajeroCookie)
      .set('Idempotency-Key', 'concurrent-cancel-sale')
      .send({
        paymentMethod: 'TRANSFERENCIA',
        bankAccountId: bank.id,
        items: [{ productId, presentationId, quantityCommercial: 1 }],
      });
    expect(saleRes.status).toBe(201);
    const path = `/api/v1/sales/${saleRes.body.id}/cancel`;
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(path)
        .set('Cookie', supervisorCookie)
        .send({ reason: 'Anulación simultánea A' }),
      request(app.getHttpServer())
        .post(path)
        .set('Cookie', supervisorCookie)
        .send({ reason: 'Anulación simultánea B' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 400]);
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: saleRes.body.id } })).status).toBe(
      'CANCELLED',
    );
    expect(
      (await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } })).currentQuantity,
    ).toBe(10);
    expect(await prisma.bankMovement.count({ where: { bankAccountId: bank.id } })).toBe(2);
    expect(
      (
        await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })
      ).currentBalance.toString(),
    ).toBe('0');
  });

  describe('AUD-006: anulación de ventas a crédito con abonos', () => {
    async function confirmCreditSaleWithPayment() {
      const saleRes = await request(app.getHttpServer())
        .post('/api/v1/sales/confirm')
        .set('Idempotency-Key', randomUUID())
        .set('Cookie', cajeroCookie)
        .send({
          paymentMethod: 'CREDITO',
          customerId,
          items: [{ productId, presentationId, quantityCommercial: 1 }],
        });
      expect(saleRes.status).toBe(201);

      const receivable = await prisma.receivable.findUniqueOrThrow({
        where: { saleId: saleRes.body.id },
      });
      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivable.id}/payments`)
        .set('Cookie', supervisorCookie)
        .send({ amount: 2000, paymentMethod: 'EFECTIVO' })
        .expect(201);
      const payment = await prisma.receivablePayment.findFirstOrThrow({
        where: { receivableId: receivable.id },
      });

      return { saleId: saleRes.body.id as string, receivableId: receivable.id, paymentId: payment.id };
    }

    it('rechaza anular una venta a crédito con abonos vigentes sin tocar lotes ni cartera', async () => {
      const { saleId, receivableId } = await confirmCreditSaleWithPayment();
      const cashMovementsBefore = await prisma.cashMovement.count();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/cancel`)
        .set('Cookie', supervisorCookie)
        .send({ reason: 'Cliente desiste de la compra' });
      expect(res.status).toBe(409);

      const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
      expect(sale.status).toBe('COMPLETED');
      const lot1 = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } });
      expect(lot1.currentQuantity).toBe(0);
      const receivable = await prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } });
      expect(receivable.status).toBe('PENDIENTE');
      expect(Number(receivable.amountPaid)).toBe(2000);
      expect(await prisma.cashMovement.count()).toBe(cashMovementsBefore);
    });

    it('permite anular la venta una vez revertidos sus abonos', async () => {
      const { saleId, receivableId, paymentId } = await confirmCreditSaleWithPayment();

      await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivableId}/payments/${paymentId}/reverse`)
        .set('Cookie', supervisorCookie)
        .send({ reason: 'Abono registrado por error' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/sales/${saleId}/cancel`)
        .set('Cookie', supervisorCookie)
        .send({ reason: 'Cliente desiste de la compra' });
      expect(res.status).toBe(200);

      const receivable = await prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } });
      expect(receivable.status).toBe('CANCELADA');
      const lot1 = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot1Id } });
      expect(lot1.currentQuantity).toBe(10);
    });

    it('un abono y una anulación simultáneos nunca dejan una venta anulada con abonos vigentes', async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saleRes = await request(app.getHttpServer())
          .post('/api/v1/sales/confirm')
          .set('Idempotency-Key', randomUUID())
          .set('Cookie', cajeroCookie)
          .send({
            paymentMethod: 'CREDITO',
            customerId,
            items: [{ productId, quantityCommercial: 1 }],
          });
        expect(saleRes.status).toBe(201);
        const saleId = saleRes.body.id as string;
        const receivable = await prisma.receivable.findUniqueOrThrow({ where: { saleId } });

        await Promise.all([
          request(app.getHttpServer())
            .post(`/api/v1/sales/${saleId}/cancel`)
            .set('Cookie', supervisorCookie)
            .send({ reason: 'Anulación concurrente' }),
          request(app.getHttpServer())
            .post(`/api/v1/receivables/${receivable.id}/payments`)
            .set('Cookie', supervisorCookie)
            .send({ amount: 100, paymentMethod: 'EFECTIVO' }),
        ]);

        const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
        const activePayments = await prisma.receivablePayment.count({
          where: { receivableId: receivable.id, isReversed: false },
        });
        expect(sale.status === 'CANCELLED' && activePayments > 0).toBe(false);
      }
    });

    it('no reabre una cuenta por cobrar CANCELADA al revertir un abono', async () => {
      const { receivableId, paymentId } = await confirmCreditSaleWithPayment();
      // Estado heredado: cuenta cancelada con un abono vigente, anterior a esta corrección
      await prisma.receivable.update({
        where: { id: receivableId },
        data: { status: 'CANCELADA' },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivableId}/payments/${paymentId}/reverse`)
        .set('Cookie', supervisorCookie)
        .send({ reason: 'Intento de reversión sobre cuenta cancelada' });
      expect(res.status).toBe(409);

      const receivable = await prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } });
      expect(receivable.status).toBe('CANCELADA');
      const payment = await prisma.receivablePayment.findUniqueOrThrow({ where: { id: paymentId } });
      expect(payment.isReversed).toBe(false);
    });
  });

  it('rechaza operaciones si el usuario carece de los permisos correspondientes (403)', async () => {
    // Usuario sin permisos intentando vender
    const resCreate = await request(app.getHttpServer())
      .post('/api/v1/sales/confirm')
      .set('Idempotency-Key', randomUUID())
      .set('Cookie', unauthorizedCookie)
      .send({
        paymentMethod: 'EFECTIVO',
        items: [{ productId, quantityCommercial: 1 }],
      });
    expect(resCreate.status).toBe(403);

    // Cajero intentando anular venta (carece de sales:cancel)
    const resCancel = await request(app.getHttpServer())
      .post(`/api/v1/sales/00000000-0000-0000-0000-000000000000/cancel`)
      .set('Cookie', cajeroCookie)
      .send({ reason: 'Sin permiso de anular' });
    expect(resCancel.status).toBe(403);
  });
});
