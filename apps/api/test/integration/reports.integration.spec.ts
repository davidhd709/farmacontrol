/**
 * ÉPICA 09 — HU-023: Reportes Esenciales de Operación y Exportación
 *
 * Pruebas de integración con PostgreSQL real.
 * Cubre:
 * - GET /api/v1/reports/inventory-valuation (JSON y CSV)
 * - GET /api/v1/reports/expirations (JSON y CSV)
 * - GET /api/v1/reports/sales (JSON y CSV)
 * - GET /api/v1/reports/cash-summary (JSON y CSV)
 * - Restricciones de autorización RBAC
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

describe('ReportsController (Integration with PostgreSQL & CSV Exports — HU-023)', () => {
  let app: INestApplication;
  let provisioningService: UserProvisioningService;
  let authService: AuthService;

  let adminCookie: string;
  let supervisorCookie: string;
  let sinPermisoCookie: string;

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

    // Usuarios
    const adminUser = await provisioningService.provisionInitialUser({
      username: 'admin_reports',
      password: 'AdminPassword123!',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({
      data: { userId: adminUser.id!, roleId: adminRole.id },
    });

    const supUser = await prisma.user.create({
      data: {
        username: 'sup_reports',
        passwordHash: adminUser.passwordHash,
        isActive: true,
      },
    });
    const supervisorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'supervisor' } });
    await prisma.userRole.create({
      data: { userId: supUser.id, roleId: supervisorRole.id },
    });

    const noPermUser = await prisma.user.create({
      data: {
        username: 'noperm_reports',
        passwordHash: adminUser.passwordHash,
        isActive: true,
      },
    });

    const adminLogin = await authService.login('admin_reports', 'AdminPassword123!');
    const supLogin = await authService.login('sup_reports', 'AdminPassword123!');
    const noPermLogin = await authService.login('noperm_reports', 'AdminPassword123!');

    adminCookie = `${SESSION_COOKIE_NAME}=${adminLogin.rawToken}`;
    supervisorCookie = `${SESSION_COOKIE_NAME}=${supLogin.rawToken}`;
    sinPermisoCookie = `${SESSION_COOKIE_NAME}=${noPermLogin.rawToken}`;

    // Datos maestros
    const cat = await prisma.category.create({
      data: { name: 'Medicamentos Generales' },
    });

    const p1 = await prisma.product.create({
      data: {
        categoryId: cat.id,
        code: 'PROD-A',
        name: 'Paracetamol 500mg',
        baseUnit: 'TAB',
        baseCost: '200',
        basePrice: '500',
      },
    });

    const p2 = await prisma.product.create({
      data: {
        categoryId: cat.id,
        code: 'PROD-B',
        name: 'Dipirona 1g',
        baseUnit: 'AMP',
        baseCost: '1500',
        basePrice: '3000',
      },
    });

    const loc = await prisma.location.create({
      data: { code: 'LOC-1', name: 'Almacén Central', isDefault: true },
    });

    // Lotes
    // Lote 1: 50 unidades, vence en 20 días (CRITICO)
    const in20Days = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    await prisma.inventoryLot.create({
      data: {
        productId: p1.id,
        locationId: loc.id,
        lotNumber: 'LOT-A1',
        expirationDate: in20Days,
        currentQuantity: 50,
      },
    });

    // Lote 2: 100 unidades, vence en 200 días (NORMAL)
    const in200Days = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000);
    await prisma.inventoryLot.create({
      data: {
        productId: p2.id,
        locationId: loc.id,
        lotNumber: 'LOT-B1',
        expirationDate: in200Days,
        currentQuantity: 100,
      },
    });

    // Cliente
    const customer = await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '11223344',
        name: 'Cliente Reporte',
      },
    });

    // Venta completada
    await prisma.sale.create({
      data: {
        invoiceNumber: 'FAC-REP-001',
        customerId: customer.id,
        createdById: adminUser.id!,
        paymentMethod: 'EFECTIVO',
        status: 'COMPLETADA',
        subtotal: '25000',
        taxTotal: '0',
        total: '25000',
        amountPaid: '25000',
        lines: {
          create: {
            productId: p1.id,
            quantityBaseUnits: 50,
            quantityCommercial: 50,
            unitPrice: '500',
            subtotal: '25000',
            total: '25000',
          },
        },
      },
    });

    // Movimientos de caja
    await prisma.cashMovement.create({
      data: {
        movementType: 'INGRESO_VENTA',
        amount: '25000',
        paymentMethod: 'EFECTIVO',
        reason: 'Pago de venta en efectivo',
        referenceDocumentType: 'VENTA',
        referenceDocumentId: 'FAC-REP-001',
        balanceAfter: '25000',
        createdByUser: { connect: { id: adminUser.id! } },
      },
    });

    await prisma.cashMovement.create({
      data: {
        movementType: 'EGRESO_MANUAL',
        amount: '5000',
        paymentMethod: 'EFECTIVO',
        reason: 'Gasto menor insumos',
        balanceAfter: '20000',
        createdByUser: { connect: { id: adminUser.id! } },
      },
    });
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('1. Reporte de Inventario Valorizado', () => {
    it('debe devolver el inventario valorizado en formato JSON con cálculos de costo y precio', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/inventory-valuation')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.totalProducts).toBe(2);
      expect(data.totalUnits).toBe(150); // 50 + 100

      // PROD-A: 50 * 200 = 10,000 costo; 50 * 500 = 25,000 precio
      // PROD-B: 100 * 1500 = 150,000 costo; 100 * 3000 = 300,000 precio
      // Total costo: 160,000; Total precio: 325,000
      expect(data.totalCostValuation).toBe(160000);
      expect(data.totalPriceValuation).toBe(325000);

      const prodA = data.items.find((i: any) => i.productCode === 'PROD-A');
      expect(prodA).toBeDefined();
      expect(prodA.currentStock).toBe(50);
      expect(prodA.totalCostValue).toBe(10000);
      expect(prodA.totalPriceValue).toBe(25000);
    });

    it('debe exportar el inventario valorizado a formato CSV con cabeceras en español y UTF-8 BOM', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/inventory-valuation?format=csv')
        .set('Cookie', supervisorCookie)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('reporte_inventario_valorizado');
      expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8
      expect(res.text).toContain('Código,Medicamento / Producto,Categoría,Unidad Base');
      expect(res.text).toContain('PROD-A');
      expect(res.text).toContain('Paracetamol 500mg');
    });
  });

  describe('2. Reporte de Lotes y Próximos Vencimientos', () => {
    it('debe devolver lotes en riesgo en formato JSON', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/expirations')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.totalLots).toBe(1); // Solo LOT-A1 que vence en 20 días
      expect(data.criticosCount).toBe(1);
      expect(data.items[0].lotNumber).toBe('LOT-A1');
      expect(data.items[0].severity).toBe('CRITICO');
    });

    it('debe exportar el reporte de vencimientos a CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/expirations?format=csv')
        .set('Cookie', supervisorCookie)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Lote,Código,Medicamento,Categoría,Fecha Vencimiento');
      expect(res.text).toContain('LOT-A1');
    });
  });

  describe('3. Reporte de Ventas por Período', () => {
    it('debe devolver las ventas y totales acumulados en formato JSON', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/sales')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.totalSales).toBe(1);
      expect(data.totalAmount).toBe(25000);
      expect(data.byPaymentMethod['EFECTIVO']).toBe(25000);
      expect(data.items[0].invoiceNumber).toBe('FAC-REP-001');
    });

    it('debe exportar las ventas a CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/sales?format=csv')
        .set('Cookie', supervisorCookie)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Comprobante,Fecha y Hora,Cliente,Documento,Medio de Pago');
      expect(res.text).toContain('FAC-REP-001');
    });
  });

  describe('4. Reporte de Resumen de Caja y Movimientos', () => {
    it('debe consolidar ingresos, egresos y flujo neto en formato JSON', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/cash-summary')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data.totalMovements).toBe(2);
      expect(data.totalInflows).toBe(25000);
      expect(data.totalOutflows).toBe(5000);
      expect(data.netCashFlow).toBe(20000); // 25,000 - 5,000
    });

    it('debe exportar el resumen de caja a CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports/cash-summary?format=csv')
        .set('Cookie', supervisorCookie)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain(
        'Fecha y Hora,Tipo Flujo,Concepto / Descripción,Débito ($),Crédito ($),Saldo ($)',
      );
      // Débito positivo y crédito negativo
      expect(res.text).toMatch(/INGRESO,[^\r\n]*,25000\.00,0\.00,/);
      expect(res.text).toMatch(/EGRESO,[^\r\n]*,0\.00,-5000\.00,/);
      expect(res.text).toContain('INGRESO');
      expect(res.text).toContain('EGRESO');
    });
  });

  describe('5. Seguridad y Autorización RBAC', () => {
    it('debe denegar acceso 403 a usuarios que no tengan el permiso reports:read', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/inventory-valuation')
        .set('Cookie', sinPermisoCookie)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/reports/sales')
        .set('Cookie', sinPermisoCookie)
        .expect(403);
    });
  });
});
