/**
 * ÉPICA 07 — HU-020 / HU-021: Cuentas por Cobrar y Cuentas por Pagar
 *
 * Pruebas de integración con PostgreSQL real.
 * Cubre:
 * - GET  /api/v1/receivables
 * - GET  /api/v1/receivables/:id
 * - POST /api/v1/receivables/:id/payments
 * - GET  /api/v1/payables
 * - GET  /api/v1/payables/:id
 * - POST /api/v1/payables/:id/payments
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('ReceivablesController & PayablesController (Integration)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let carteraCookie: string;
  let adminCookie: string;

  let customerId: string;
  let supplierId: string;

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

    // Crear usuarios de prueba
    const adminUser = await provisioningService.provisionInitialUser({
      username: 'admin_test',
      password: 'Admin12345!',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: { userId: adminUser.id!, roleId: adminRole.id },
    });

    const carteraUser = await prisma.user.create({
      data: {
        username: 'cartera_test',
        passwordHash: adminUser.passwordHash,
        isActive: true,
      },
    });
    const carteraRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cartera' } });
    await prisma.userRole.create({
      data: { userId: carteraUser.id, roleId: carteraRole.id },
    });

    // Autenticar
    const adminLogin = await authService.login('admin_test', 'Admin12345!');
    const carteraLogin = await authService.login('cartera_test', 'Admin12345!');

    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;
    carteraCookie = `${SESSION_COOKIE_NAME}=${carteraLogin.rawToken}`;

    // Crear datos base
    const category = await prisma.category.create({
      data: { name: 'Analgésicos' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'PROD-001',
        name: 'Acetaminofén 500mg',
        baseUnit: 'TAB',
        basePrice: '500',
        baseCost: '300',
      },
    });

    const location = await prisma.location.create({
      data: { code: 'A-01', name: 'Estante A', isDefault: true },
    });

    await prisma.inventoryLot.create({
      data: {
        productId: product.id,
        locationId: location.id,
        lotNumber: 'L001',
        expirationDate: new Date('2027-12-31'),
        currentQuantity: 100,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '123456789',
        name: 'Juan Pérez',
      },
    });
    customerId = customer.id;

    const supplier = await prisma.supplier.create({
      data: {
        taxId: '900123456-7',
        name: 'Distribuidora ABC S.A.S.',
      },
    });
    supplierId = supplier.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  // ================================================================== //
  //  Cuentas por Cobrar (HU-020)
  // ================================================================== //

  describe('GET /api/v1/receivables', () => {
    it('retorna lista vacía cuando no hay cuentas', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/receivables')
        .set('Cookie', carteraCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.total).toBe(0);
    });

    it('retorna cuentas por cobrar con filtros', async () => {
      // Crear una cuenta manualmente
      const sale = await prisma.sale.create({
        data: {
          invoiceNumber: 'INV-001',
          customerId,
          paymentMethod: 'CREDITO',
          subtotal: '50000',
          total: '50000',
          createdById: (await prisma.user.findFirst({ where: { username: 'admin_test' } }))!.id,
        },
      });

      await prisma.receivable.create({
        data: {
          saleId: sale.id,
          customerId,
          totalAmount: '50000',
          balance: '50000',
          status: 'PENDIENTE',
          dueDate: new Date('2027-01-31'),
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/receivables?status=PENDIENTE')
        .set('Cookie', carteraCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe('PENDIENTE');
      expect(res.body.data.items[0].customerName).toBe('Juan Pérez');
    });

    it('requiere autenticación', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/receivables');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/receivables/:id', () => {
    it('retorna 404 para ID inexistente', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/receivables/00000000-0000-0000-0000-000000000000')
        .set('Cookie', carteraCookie);

      expect(res.status).toBe(404);
    });

    it('retorna el detalle con historial de pagos', async () => {
      const adminUser = await prisma.user.findFirst({ where: { username: 'admin_test' } });

      const sale = await prisma.sale.create({
        data: {
          invoiceNumber: 'INV-002',
          customerId,
          paymentMethod: 'CREDITO',
          subtotal: '30000',
          total: '30000',
          createdById: adminUser!.id,
        },
      });

      const receivable = await prisma.receivable.create({
        data: {
          saleId: sale.id,
          customerId,
          totalAmount: '30000',
          balance: '30000',
          status: 'PENDIENTE',
          dueDate: new Date('2027-03-31'),
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/receivables/${receivable.id}`)
        .set('Cookie', carteraCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(receivable.id);
      expect(res.body.data.totalAmount).toBe('30000');
      expect(res.body.data.payments).toEqual([]);
    });
  });

  describe('POST /api/v1/receivables/:id/payments', () => {
    it('aplica un abono parcial correctamente', async () => {
      const adminUser = await prisma.user.findFirst({ where: { username: 'admin_test' } });

      // Crear movimiento de caja inicial
      await prisma.cashMovement.create({
        data: {
          movementType: 'INGRESO_MANUAL',
          amount: '10000',
          paymentMethod: 'EFECTIVO',
          reason: 'Saldo inicial',
          balanceAfter: '10000',
          createdByUserId: adminUser!.id,
        },
      });

      const sale = await prisma.sale.create({
        data: {
          invoiceNumber: 'INV-003',
          customerId,
          paymentMethod: 'CREDITO',
          subtotal: '100000',
          total: '100000',
          createdById: adminUser!.id,
        },
      });

      const receivable = await prisma.receivable.create({
        data: {
          saleId: sale.id,
          customerId,
          totalAmount: '100000',
          balance: '100000',
          status: 'PENDIENTE',
          dueDate: new Date('2027-06-30'),
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivable.id}/payments`)
        .set('Cookie', carteraCookie)
        .send({ amount: 40000, paymentMethod: 'EFECTIVO' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDIENTE');
      expect(parseFloat(res.body.data.amountPaid)).toBeCloseTo(40000, 0);
      expect(parseFloat(res.body.data.balance)).toBeCloseTo(60000, 0);
    });

    it('cierra la cuenta al pagar el saldo completo', async () => {
      const adminUser = await prisma.user.findFirst({ where: { username: 'admin_test' } });

      await prisma.cashMovement.create({
        data: {
          movementType: 'INGRESO_MANUAL',
          amount: '10000',
          paymentMethod: 'EFECTIVO',
          reason: 'Saldo inicial',
          balanceAfter: '10000',
          createdByUserId: adminUser!.id,
        },
      });

      const sale = await prisma.sale.create({
        data: {
          invoiceNumber: 'INV-004',
          customerId,
          paymentMethod: 'CREDITO',
          subtotal: '20000',
          total: '20000',
          createdById: adminUser!.id,
        },
      });

      const receivable = await prisma.receivable.create({
        data: {
          saleId: sale.id,
          customerId,
          totalAmount: '20000',
          balance: '20000',
          status: 'PENDIENTE',
          dueDate: new Date('2027-06-30'),
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivable.id}/payments`)
        .set('Cookie', carteraCookie)
        .send({ amount: 20000, paymentMethod: 'TRANSFERENCIA' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PAGADA');
      expect(parseFloat(res.body.data.balance)).toBeCloseTo(0, 0);
    });

    it('rechaza abono mayor al saldo', async () => {
      const adminUser = await prisma.user.findFirst({ where: { username: 'admin_test' } });

      const sale = await prisma.sale.create({
        data: {
          invoiceNumber: 'INV-005',
          customerId,
          paymentMethod: 'CREDITO',
          subtotal: '10000',
          total: '10000',
          createdById: adminUser!.id,
        },
      });

      const receivable = await prisma.receivable.create({
        data: {
          saleId: sale.id,
          customerId,
          totalAmount: '10000',
          balance: '10000',
          status: 'PENDIENTE',
          dueDate: new Date('2027-06-30'),
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/receivables/${receivable.id}/payments`)
        .set('Cookie', carteraCookie)
        .send({ amount: 99999 });

      expect(res.status).toBe(400);
    });
  });

  // ================================================================== //
  //  Cuentas por Pagar (HU-021)
  // ================================================================== //

  describe('GET /api/v1/payables', () => {
    it('retorna lista vacía cuando no hay cuentas', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payables')
        .set('Cookie', carteraCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
    });

    it('requiere autenticación', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/payables');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/payables/:id', () => {
    it('retorna 404 para ID inexistente', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payables/00000000-0000-0000-0000-000000000000')
        .set('Cookie', carteraCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/payables/:id/payments', () => {
    it('aplica un pago parcial a cuentas por pagar', async () => {
      const adminUser = await prisma.user.findFirst({ where: { username: 'admin_test' } });

      // Saldo inicial de caja positivo
      await prisma.cashMovement.create({
        data: {
          movementType: 'INGRESO_MANUAL',
          amount: '500000',
          paymentMethod: 'EFECTIVO',
          reason: 'Saldo inicial de prueba',
          balanceAfter: '500000',
          createdByUserId: adminUser!.id,
        },
      });

      const purchase = await prisma.purchase.create({
        data: {
          supplierId,
          invoiceNumber: 'FACT-001',
          purchaseDate: new Date('2026-09-01'),
          totalAmount: '200000',
          status: 'RECEIVED',
          receivedByUserId: adminUser!.id,
        },
      });

      const payable = await prisma.payable.create({
        data: {
          purchaseId: purchase.id,
          supplierId,
          totalAmount: '200000',
          balance: '200000',
          status: 'PENDIENTE',
          dueDate: new Date('2026-10-31'),
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payables/${payable.id}/payments`)
        .set('Cookie', carteraCookie)
        .send({ amount: 80000, paymentMethod: 'TRANSFERENCIA' });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDIENTE');
      expect(parseFloat(res.body.data.amountPaid)).toBeCloseTo(80000, 0);
      expect(parseFloat(res.body.data.balance)).toBeCloseTo(120000, 0);
    });

    it('cierra la cuenta al pagar el monto total', async () => {
      const adminUser = await prisma.user.findFirst({ where: { username: 'admin_test' } });

      await prisma.cashMovement.create({
        data: {
          movementType: 'INGRESO_MANUAL',
          amount: '500000',
          paymentMethod: 'EFECTIVO',
          reason: 'Saldo inicial',
          balanceAfter: '500000',
          createdByUserId: adminUser!.id,
        },
      });

      const purchase = await prisma.purchase.create({
        data: {
          supplierId,
          invoiceNumber: 'FACT-002',
          purchaseDate: new Date('2026-09-15'),
          totalAmount: '50000',
          status: 'RECEIVED',
          receivedByUserId: adminUser!.id,
        },
      });

      const payable = await prisma.payable.create({
        data: {
          purchaseId: purchase.id,
          supplierId,
          totalAmount: '50000',
          balance: '50000',
          status: 'PENDIENTE',
          dueDate: new Date('2026-12-31'),
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payables/${payable.id}/payments`)
        .set('Cookie', carteraCookie)
        .send({ amount: 50000 });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PAGADA');
      expect(parseFloat(res.body.data.balance)).toBeCloseTo(0, 0);

      // Verificar que se generó egreso de caja
      const cashMovements = await prisma.cashMovement.findMany({
        where: { referenceDocumentType: 'PAYABLE', referenceDocumentId: payable.id },
      });
      expect(cashMovements).toHaveLength(1);
      expect(Number(cashMovements[0].amount)).toBeCloseTo(50000, 0);
    });

    it('rechaza pago mayor al saldo', async () => {
      const adminUser = await prisma.user.findFirst({ where: { username: 'admin_test' } });

      const purchase = await prisma.purchase.create({
        data: {
          supplierId,
          invoiceNumber: 'FACT-003',
          purchaseDate: new Date(),
          totalAmount: '15000',
          status: 'RECEIVED',
          receivedByUserId: adminUser!.id,
        },
      });

      const payable = await prisma.payable.create({
        data: {
          purchaseId: purchase.id,
          supplierId,
          totalAmount: '15000',
          balance: '15000',
          status: 'PENDIENTE',
          dueDate: new Date('2026-12-31'),
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/payables/${payable.id}/payments`)
        .set('Cookie', carteraCookie)
        .send({ amount: 99999 });

      expect(res.status).toBe(400);
    });
  });
});
