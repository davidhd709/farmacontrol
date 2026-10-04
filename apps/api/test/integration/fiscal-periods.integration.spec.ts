import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { prisma, cleanTestDatabase, seedRbac, AccountingPurpose as DbPurpose } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import { FiscalPeriodsService } from '../../src/modules/accounting/application/fiscal-periods.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('Fiscal Periods & Historical Locking Integration (PostgreSQL)', () => {
  let app: INestApplication;
  let adminCookie: string;
  let cashierCookie: string;
  let adminUserId: string;
  let journalService: JournalService;
  let fiscalPeriodsService: FiscalPeriodsService;

  let accountCash: any;
  let accountSales: any;
  let accountCost: any;
  let accountInventory: any;
  let accountExpense: any;
  let accountResult: any;

  beforeAll(async () => {
    await cleanTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const provisioning = module.get(UserProvisioningService);
    const auth = module.get(AuthService);
    journalService = module.get(JournalService);
    fiscalPeriodsService = module.get(FiscalPeriodsService);

    await cleanTestDatabase();
    await seedRbac(prisma);

    const user = await provisioning.provisionInitialUser({
      username: 'fiscal_admin',
      password: 'AdminPassword#2026',
    });
    adminUserId = user.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: user.id!, roleId: adminRole.id } });
    const login = await auth.login('fiscal_admin', 'AdminPassword#2026');
    adminCookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;

    const cashier = await prisma.user.create({
      data: { username: 'fiscal_cashier', passwordHash: user.passwordHash },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('fiscal_cashier', 'AdminPassword#2026')).rawToken}`;

    await setupAccounts();
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 45000);

  async function setupAccounts() {
    accountCash = await prisma.account.create({
      data: {
        code: '110505',
        name: 'Caja General',
        type: 'ASSET',
        level: 1,
        allowsMovement: true,
        isActive: true,
      },
    });
    await prisma.companyAccountingMapping.create({
      data: {
        purpose: 'CASH',
        accountId: accountCash.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
      },
    });

    accountSales = await prisma.account.create({
      data: {
        code: '413501',
        name: 'Ventas de Medicamentos',
        type: 'INCOME',
        level: 1,
        allowsMovement: true,
        isActive: true,
      },
    });
    await prisma.companyAccountingMapping.create({
      data: {
        purpose: 'SALES_TAXED',
        accountId: accountSales.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
      },
    });

    accountCost = await prisma.account.create({
      data: {
        code: '613501',
        name: 'Costo de Ventas',
        type: 'COST',
        level: 1,
        allowsMovement: true,
        isActive: true,
      },
    });
    await prisma.companyAccountingMapping.create({
      data: {
        purpose: 'COST_OF_SALES',
        accountId: accountCost.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
      },
    });

    accountInventory = await prisma.account.create({
      data: {
        code: '143501',
        name: 'Inventarios',
        type: 'ASSET',
        level: 1,
        allowsMovement: true,
        isActive: true,
      },
    });
    await prisma.companyAccountingMapping.create({
      data: {
        purpose: 'INVENTORY',
        accountId: accountInventory.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
      },
    });

    accountExpense = await prisma.account.create({
      data: {
        code: '513505',
        name: 'Gastos de Servicios Públicos',
        type: 'EXPENSE',
        level: 1,
        allowsMovement: true,
        isActive: true,
      },
    });

    accountResult = await prisma.account.create({
      data: {
        code: '360505',
        name: 'Utilidad del Ejercicio',
        type: 'EQUITY',
        level: 1,
        allowsMovement: true,
        isActive: true,
      },
    });
    await prisma.companyAccountingMapping.create({
      data: {
        purpose: 'CURRENT_YEAR_RESULT',
        accountId: accountResult.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
      },
    });
  }

  it('1. Genera 12 períodos fiscales para el año 2026 de forma idempotente', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/accounting/periods/generate')
      .set('Cookie', adminCookie)
      .send({ year: 2026 })
      .expect(201);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(12);

    expect(res.body[0].month).toBe(1);
    expect(res.body[0].name).toBe('Enero 2026');
    expect(res.body[0].status).toBe('OPEN');
    expect(res.body[0].startDate).toBe('2026-01-01');
    expect(res.body[0].endDate).toBe('2026-01-31');

    expect(res.body[11].month).toBe(12);
    expect(res.body[11].name).toBe('Diciembre 2026');
    expect(res.body[11].status).toBe('OPEN');

    // Idempotencia: llamar de nuevo no duplica
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/accounting/periods/generate')
      .set('Cookie', adminCookie)
      .send({ year: 2026 })
      .expect(201);

    expect(res2.body.length).toBe(12);
  });

  it('2. Lista períodos fiscales filtrando por año y estado', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/accounting/periods?year=2026&status=OPEN')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(res.body.length).toBe(12);
    expect(res.body.every((p: any) => p.status === 'OPEN')).toBe(true);
  });

  it('3. Permite registrar asientos dentro de un período abierto y actualiza contadores', async () => {
    // Asiento 1: Venta y Costo el 2026-01-15
    await journalService.post({
      entryDate: '2026-01-15',
      description: 'Venta de contado enero',
      sourceType: 'TEST_SALE',
      sourceId: 'sale-001',
      createdById: adminUserId,
      lines: [
        { accountId: accountCash.id, debit: '100000.00', credit: '0.00' },
        { accountId: accountSales.id, debit: '0.00', credit: '100000.00' },
      ],
    });

    // Asiento 2: Gasto de servicio público el 2026-01-20
    await journalService.post({
      entryDate: '2026-01-20',
      description: 'Pago de energía eléctrica',
      sourceType: 'TEST_EXPENSE',
      sourceId: 'exp-001',
      createdById: adminUserId,
      lines: [
        { accountId: accountExpense.id, debit: '30000.00', credit: '0.00' },
        { accountId: accountCash.id, debit: '0.00', credit: '30000.00' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/accounting/periods?year=2026')
      .set('Cookie', adminCookie)
      .expect(200);

    const enero = res.body.find((p: any) => p.month === 1);
    expect(enero).toBeDefined();
    expect(enero.entriesCount).toBe(2);
    expect(enero.totalDebits).toBe('130000.00');
    expect(enero.totalCredits).toBe('130000.00');
  });

  it('4. Cierra el período fiscal generando asiento de cierre balanceado', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/accounting/periods?year=2026')
      .set('Cookie', adminCookie)
      .expect(200);

    const enero = listRes.body.find((p: any) => p.month === 1);

    const closeRes = await request(app.getHttpServer())
      .post(`/api/v1/accounting/periods/${enero.id}/close`)
      .set('Cookie', adminCookie)
      .send({
        generateClosingEntry: true,
        notes: 'Cierre mensual regular de Enero 2026',
      })
      .expect(201);

    expect(closeRes.body.status).toBe('CLOSED');
    expect(closeRes.body.closedAt).not.toBeNull();
    expect(closeRes.body.closedByName).toBe('fiscal_admin');
    expect(closeRes.body.closingEntryId).not.toBeNull();
    expect(closeRes.body.notes).toBe('Cierre mensual regular de Enero 2026');

    // Verificar que el asiento de cierre existe y está balanceado
    const closingEntry = await prisma.journalEntry.findUnique({
      where: { id: closeRes.body.closingEntryId! },
      include: { lines: { include: { account: true } } },
    });

    expect(closingEntry).toBeDefined();
    expect(closingEntry?.sourceType).toBe('FISCAL_CLOSING');
    expect(closingEntry?.sourceId).toBe(enero.id);
    expect(closingEntry?.status).toBe('POSTED');

    let sumDebit = 0n;
    let sumCredit = 0n;
    for (const line of closingEntry!.lines) {
      sumDebit += BigInt(Math.round(Number(line.debit) * 100));
      sumCredit += BigInt(Math.round(Number(line.credit) * 100));
    }
    expect(sumDebit).toBe(sumCredit);
    // Venta: 100,000 (crédito) debita 100,000
    // Gasto: 30,000 (débito) acredita 30,000
    // Utilidad: 70,000 acredita 70,000
    // Total débito = 100,000; Total crédito = 100,000 (10000000 cents)
    expect(sumDebit).toBe(10000000n);
  });

  it('5. BLOQUEO HISTÓRICO: Rechaza crear asientos en un período cerrado', async () => {
    // Intentar registrar asiento el 2026-01-25 (Enero cerrado)
    await expect(
      journalService.post({
        entryDate: '2026-01-25',
        description: 'Venta tardía fuera de tiempo',
        sourceType: 'TEST_LATE_SALE',
        sourceId: 'late-001',
        lines: [
          { accountId: accountCash.id, debit: '50000.00', credit: '0.00' },
          { accountId: accountSales.id, debit: '0.00', credit: '50000.00' },
        ],
      }),
    ).rejects.toThrow(/período cerrado/i);

    // En cambio, en Febrero (abierto) sí se puede registrar sin problema
    const febEntry = await journalService.post({
      entryDate: '2026-02-05',
      description: 'Venta normal en Febrero',
      sourceType: 'TEST_FEB_SALE',
      sourceId: 'feb-001',
      lines: [
        { accountId: accountCash.id, debit: '50000.00', credit: '0.00' },
        { accountId: accountSales.id, debit: '0.00', credit: '50000.00' },
      ],
    });
    expect(febEntry.status).toBe('POSTED');
  });

  it('6. BLOQUEO HISTÓRICO: Rechaza reversar asientos en una fecha correspondiente a un período cerrado', async () => {
    // Intentar reversar el asiento feb-001 pero asignando fecha de reversión en Enero 2026 (cerrado)
    const febEntry = await journalService.findBySource('TEST_FEB_SALE', 'feb-001');

    await expect(
      journalService.reverse({
        entryId: febEntry!.id,
        entryDate: '2026-01-28',
        reason: 'Error en fecha de reversión',
      }),
    ).rejects.toThrow(/período cerrado/i);
  });

  it('7. Reabre el período fiscal con trazabilidad de auditoría y revierte el cierre contable', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/accounting/periods?year=2026')
      .set('Cookie', adminCookie)
      .expect(200);

    const enero = listRes.body.find((p: any) => p.month === 1);
    expect(enero.status).toBe('CLOSED');

    // Intento fallido por motivo muy corto (< 10 caracteres)
    await request(app.getHttpServer())
      .post(`/api/v1/accounting/periods/${enero.id}/reopen`)
      .set('Cookie', adminCookie)
      .send({ reason: 'muy corto' })
      .expect(400);

    // Reapertura válida
    const reopenRes = await request(app.getHttpServer())
      .post(`/api/v1/accounting/periods/${enero.id}/reopen`)
      .set('Cookie', adminCookie)
      .send({
        reason: 'Ajuste extraordinario autorizado por auditoría de fin de año',
      })
      .expect(201);

    expect(reopenRes.body.status).toBe('OPEN');
    expect(reopenRes.body.reopenedAt).not.toBeNull();
    expect(reopenRes.body.reopenedByName).toBe('fiscal_admin');
    expect(reopenRes.body.reopenReason).toBe(
      'Ajuste extraordinario autorizado por auditoría de fin de año',
    );
    expect(reopenRes.body.closingEntryId).toBeNull();

    // Ahora sí es posible registrar un asiento el 2026-01-25 en Enero
    const newEntry = await journalService.post({
      entryDate: '2026-01-25',
      description: 'Ajuste contable tras reapertura',
      sourceType: 'TEST_ADJUSTMENT',
      sourceId: 'adj-001',
      lines: [
        { accountId: accountCash.id, debit: '25000.00', credit: '0.00' },
        { accountId: accountSales.id, debit: '0.00', credit: '25000.00' },
      ],
    });
    expect(newEntry.status).toBe('POSTED');
  });

  it('8. RBAC: Deniega operaciones de gestión a usuarios sin permiso accounting:manage', async () => {
    // Cajero intenta generar períodos -> 403
    await request(app.getHttpServer())
      .post('/api/v1/accounting/periods/generate')
      .set('Cookie', cashierCookie)
      .send({ year: 2027 })
      .expect(403);

    // Cajero intenta cerrar período -> 403
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/accounting/periods?year=2026')
      .set('Cookie', adminCookie)
      .expect(200);

    const enero = listRes.body.find((p: any) => p.month === 1);

    await request(app.getHttpServer())
      .post(`/api/v1/accounting/periods/${enero.id}/close`)
      .set('Cookie', cashierCookie)
      .send({ notes: 'Intento no autorizado' })
      .expect(403);

    // Cajero intenta reabrir período -> 403
    await request(app.getHttpServer())
      .post(`/api/v1/accounting/periods/${enero.id}/reopen`)
      .set('Cookie', cashierCookie)
      .send({ reason: 'Intento de reapertura no autorizada' })
      .expect(403);
  });
});
