import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { prisma, cleanTestDatabase, seedRbac, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('FEFO Inventory Concurrency & Stress Testing (PostgreSQL Real)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;
  let sessionCookie: string;

  let productId: string;
  let presentationId: string;
  let defaultCustomerId: string;
  let locationId: string;

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
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    // 1. Crear usuario administrador para las pruebas
    const adminUser = await provisioningService.provisionInitialUser({
      username: 'cajero_concurrente',
      password: 'Password#2026!',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: { userId: adminUser.id!, roleId: adminRole.id },
    });

    const loginRes = await authService.login('cajero_concurrente', 'Password#2026!');
    sessionCookie = `${SESSION_COOKIE_NAME}=${loginRes.rawToken}`;

    // 2. Cliente consumidor final
    const defaultCust = await prisma.customer.upsert({
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
    defaultCustomerId = defaultCust.id;

    // 3. Ubicación
    const location = await prisma.location.create({
      data: { code: 'POS-CONC', name: 'Estante Concurrencia', isDefault: true },
    });
    locationId = location.id;

    // 4. Categoría y Producto con control de lotes
    const category = await prisma.category.create({
      data: { name: 'Antibióticos', description: 'Medicamentos bajo control estricto' },
    });

    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        code: 'AMX-500-CONC',
        name: 'Amoxicilina 500mg Concurrente',
        baseUnit: 'CAPSULA',
        basePrice: new Prisma.Decimal('1000.00'),
        baseCost: new Prisma.Decimal('600.00'),
        requiresLotControl: true,
      },
    });
    productId = product.id;

    const presentation = await prisma.productPresentation.create({
      data: {
        productId,
        name: 'Unidad Individual',
        conversionFactor: 1,
        price: new Prisma.Decimal('1000.00'),
        cost: new Prisma.Decimal('600.00'),
        isDefault: true,
      },
    });
    presentationId = presentation.id;

    // 5. Asiento contable de apertura y saldo inicial de caja
    await prisma.cashMovement.create({
      data: {
        movementType: 'APERTURA',
        amount: new Prisma.Decimal('500000.00'),
        balanceAfter: new Prisma.Decimal('500000.00'),
        paymentMethod: 'EFECTIVO',
        reason: 'Apertura de turno de prueba',
        createdByUserId: adminUser.id,
      },
    });
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await cleanTestDatabase();
  });

  describe('1. Prevención Absoluta de Sobreventa (10 cajeros concurrentes compiten por 10 unidades)', () => {
    it('debe despachar exactamente 10 unidades y rechazar las demás peticiones sin saldo negativo', async () => {
      // Crear un único lote con exactamente 10 unidades disponibles
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + 45);

      const lot = await prisma.inventoryLot.create({
        data: {
          productId,
          locationId,
          lotNumber: 'LOT-RACE-10',
          currentQuantity: 10,
          expirationDate: expDate,
          isActive: true,
        },
      });

      // 10 cajeros concurrentes disparan peticiones en paralelo solicitando 2 unidades cada uno
      // Total solicitado = 20 unidades. Disponible = 10 unidades.
      const concurrentRequests = Array.from({ length: 10 }).map((_, index) => {
        return request(app.getHttpServer())
          .post('/api/v1/sales/confirm')
          .set('Cookie', sessionCookie)
          .send({
            customerId: defaultCustomerId,
            paymentMethod: 'EFECTIVO',
            items: [
              {
                productId,
                presentationId,
                quantityCommercial: 2,
              },
            ],
            notes: `Venta concurrente cajero #${index + 1}`,
          });
      });

      const responses = await Promise.all(concurrentRequests);

      const successfulSales = responses.filter((r) => r.status === 201 || r.status === 200);
      const rejectedSales = responses.filter((r) => r.status === 400);

      // Verificación de integridad matemática:
      // Exactamente 5 ventas deben tener éxito (5 * 2 = 10 unidades)
      expect(successfulSales.length).toBe(5);
      // Exactamente 5 ventas deben ser rechazadas por falta de existencias
      expect(rejectedSales.length).toBe(5);

      for (const rejected of rejectedSales) {
        expect(rejected.body.message).toMatch(/stock|existencia/i);
      }

      // Verificación en base de datos:
      // El lote debe haber quedado exactamente en 0 (NUNCA saldo negativo)
      const updatedLot = await prisma.inventoryLot.findUnique({
        where: { id: lot.id },
      });
      expect(updatedLot?.currentQuantity).toBe(0);

      // El kardex debe tener exactamente 5 salidas de venta de 2 unidades cada una
      const movements = await prisma.inventoryMovement.findMany({
        where: { lotId: lot.id, movementType: 'SALIDA_VENTA' },
      });
      expect(movements.length).toBe(5);
      const totalUnitsDeducted = movements.reduce((acc, m) => acc + m.quantityBaseUnits, 0);
      expect(totalUnitsDeducted).toBe(10);

      // Verificación de caja:
      // Saldo inicial = 500.000. 5 ventas de 2.000 = 10.000.
      // Saldo final de caja debe ser exactamente 510.000
      const lastCashMovement = await prisma.cashMovement.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      expect(Number(lastCashMovement?.balanceAfter)).toBe(510000);
    });
  });

  describe('2. Asignación Cascada FEFO Concurrente Multilote', () => {
    it('debe agotar primero el lote próximo a vencer y continuar con el siguiente lote de forma consistente', async () => {
      // Lote 1: Vence en 15 días, saldo = 6 unidades
      const expClose = new Date();
      expClose.setDate(expClose.getDate() + 15);
      const lotClose = await prisma.inventoryLot.create({
        data: {
          productId,
          locationId,
          lotNumber: 'LOT-FEFO-CLOSE',
          currentQuantity: 6,
          expirationDate: expClose,
          isActive: true,
        },
      });

      // Lote 2: Vence en 90 días, saldo = 14 unidades
      const expFar = new Date();
      expFar.setDate(expFar.getDate() + 90);
      const lotFar = await prisma.inventoryLot.create({
        data: {
          productId,
          locationId,
          lotNumber: 'LOT-FEFO-FAR',
          currentQuantity: 14,
          expirationDate: expFar,
          isActive: true,
        },
      });

      // 4 peticiones concurrentes solicitando 4 unidades cada una (Total = 16 unidades de 20 disponibles)
      const concurrentRequests = Array.from({ length: 4 }).map((_, index) => {
        return request(app.getHttpServer())
          .post('/api/v1/sales/confirm')
          .set('Cookie', sessionCookie)
          .send({
            customerId: defaultCustomerId,
            paymentMethod: 'EFECTIVO',
            items: [
              {
                productId,
                presentationId,
                quantityCommercial: 4,
              },
            ],
            notes: `Venta FEFO concurrente #${index + 1}`,
          });
      });

      const responses = await Promise.all(concurrentRequests);

      // Todas las 4 ventas deben ser exitosas (16 <= 20)
      const successfulSales = responses.filter((r) => r.status === 201 || r.status === 200);
      expect(successfulSales.length).toBe(4);

      // Verificar que el Lote 1 (más cercano a vencer) quedó totalmente agotado (0)
      const updatedLotClose = await prisma.inventoryLot.findUnique({
        where: { id: lotClose.id },
      });
      expect(updatedLotClose?.currentQuantity).toBe(0);

      // Verificar que el Lote 2 cubrió las 10 unidades restantes (14 - 10 = 4 unidades remanentes)
      const updatedLotFar = await prisma.inventoryLot.findUnique({
        where: { id: lotFar.id },
      });
      expect(updatedLotFar?.currentQuantity).toBe(4);

      // Total de existencias remanentes en base de datos = 4
      const totalRemaining = (updatedLotClose?.currentQuantity ?? 0) + (updatedLotFar?.currentQuantity ?? 0);
      expect(totalRemaining).toBe(4);

      // Total descontado en Kardex = 16
      const allMovements = await prisma.inventoryMovement.findMany({
        where: { productId, movementType: 'SALIDA_VENTA' },
      });
      const totalKardexUnits = allMovements.reduce((acc, m) => acc + m.quantityBaseUnits, 0);
      expect(totalKardexUnits).toBe(16);
    });
  });

  describe('3. Concurrencia de Movimientos de Caja (Serialización con Locks)', () => {
    it('debe acumular los saldos de caja sin condiciones de carrera ante ráfagas de ventas en efectivo', async () => {
      // Lote con suficiente stock
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + 60);

      await prisma.inventoryLot.create({
        data: {
          productId,
          locationId,
          lotNumber: 'LOT-CASH-STRESS',
          currentQuantity: 100,
          expirationDate: expDate,
          isActive: true,
        },
      });

      // 6 ventas simultáneas en efectivo de 1 unidad cada una ($1.000)
      const cashRequests = Array.from({ length: 6 }).map((_, index) => {
        return request(app.getHttpServer())
          .post('/api/v1/sales/confirm')
          .set('Cookie', sessionCookie)
          .send({
            customerId: defaultCustomerId,
            paymentMethod: 'EFECTIVO',
            items: [
              {
                productId,
                presentationId,
                quantityCommercial: 1,
              },
            ],
            notes: `Venta caja concurrente #${index + 1}`,
          });
      });

      const responses = await Promise.all(cashRequests);

      for (const res of responses) {
        expect(res.status).toBe(201);
      }

      // Saldo inicial de caja era 500.000 + 6 ventas de 1.000 = 506.000 exactos
      const lastMovement = await prisma.cashMovement.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      expect(Number(lastMovement?.balanceAfter)).toBe(506000);

      // Los 6 movimientos de ingreso de venta deben existir en orden cronológico
      const saleMovements = await prisma.cashMovement.findMany({
        where: { movementType: 'INGRESO_VENTA' },
      });
      expect(saleMovements.length).toBe(6);
    });
  });
});
