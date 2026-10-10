import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma, seedRbac, AccountingPurpose } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import { AccountingReportsService } from '../../src/modules/accounting/application/reports.service';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/** Cierre anual hacia 3705/3710 (acuerdo del 4 de octubre), con PostgreSQL real. */
describe('Cierre anual', () => {
  let app: INestApplication;
  let journal: JournalService;
  let reports: AccountingReportsService;
  let provisioning: UserProvisioningService;
  let auth: AuthService;
  let adminCookie: string;
  let cashierCookie: string;
  const acc: Record<string, string> = {};

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    journal = module.get(JournalService);
    reports = module.get(AccountingReportsService);
    provisioning = module.get(UserProvisioningService);
    auth = module.get(AuthService);
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await provisioning.provisionInitialUser({ username: 'contadora_ca', password: 'AdminPassword#2026' });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('contadora_ca', 'AdminPassword#2026')).rawToken}`;
    const cashier = await prisma.user.create({ data: { username: 'cajero_ca', passwordHash: admin.passwordHash } });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('cajero_ca', 'AdminPassword#2026')).rawToken}`;

    const accounts: Array<[string, string, string, 'ASSET' | 'INCOME' | 'COST' | 'EXPENSE' | 'EQUITY', AccountingPurpose?]> = [
      ['caja', '110505', 'CAJA GENERAL', 'ASSET'],
      ['ventas', '413538', 'VENTA DE PRODUCTOS FARMACEUTICOS', 'INCOME'],
      ['descuentos', '417506', 'DESCUENTOS CONDICIONADOS (DB)', 'INCOME'],
      ['costo', '613538', 'COSTO DE VENTAS', 'COST'],
      ['gasto', '513525', 'ENERGIA ELECTRICA', 'EXPENSE'],
      ['resultado', '360505', 'UTILIDAD DEL EJERCICIO', 'EQUITY', 'CURRENT_YEAR_RESULT'],
      ['utilidades', '370505', 'UTILIDADES ACUMULADAS', 'EQUITY', 'RETAINED_EARNINGS'],
      ['perdidas', '371005', 'PERDIDAS ACUMULADAS', 'EQUITY', 'ACCUMULATED_LOSSES'],
    ];
    for (const [key, code, name, type, purpose] of accounts) {
      const created = await prisma.account.create({ data: { code, name, type, level: 1, allowsMovement: true } });
      acc[key] = created.id;
      if (purpose) {
        await prisma.companyAccountingMapping.create({
          data: { purpose, accountId: created.id, status: 'ACTIVE', effectiveFrom: new Date('2000-01-01') },
        });
      }
    }
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  let seq = 0;
  const entry = (date: string, debitKey: string, creditKey: string, amount: string) =>
    journal.post({
      entryDate: date,
      description: 'Movimiento de prueba',
      sourceType: 'TEST',
      sourceId: `ca-${++seq}`,
      lines: [
        { accountId: acc[debitKey], debit: amount, credit: '0.00' },
        { accountId: acc[creditKey], debit: '0.00', credit: amount },
      ],
    });

  /** Ejemplo de la reunión: ventas 30 M, descuentos 0,5 M, costo 18 M, gastos 1,5 M. */
  async function profitableYear() {
    await entry('2025-03-10', 'caja', 'ventas', '30000000.00');
    await entry('2025-03-10', 'descuentos', 'caja', '500000.00');
    await entry('2025-03-10', 'costo', 'caja', '18000000.00');
    await entry('2025-06-15', 'gasto', 'caja', '1500000.00');
  }

  const preview = (year: number) =>
    request(app.getHttpServer()).get(`/api/v1/accounting/annual-closings/preview?year=${year}`).set('Cookie', adminCookie);
  const close = (year: number, key: string | null = randomUUID(), cookie = adminCookie) => {
    const req = request(app.getHttpServer()).post('/api/v1/accounting/annual-closings').set('Cookie', cookie);
    if (key) req.set('Idempotency-Key', key);
    return req.send({ year });
  };

  it('muestra el impacto y traslada la utilidad a 3705 con fecha 31 de diciembre', async () => {
    await profitableYear();
    // Un cierre mensual previo pudo haber llevado parte del resultado a 3605
    await entry('2025-11-30', 'ventas', 'resultado', '1000000.00');

    const p = await preview(2025).expect(200);
    expect(p.body.entryDate).toBe('2025-12-31');
    expect(p.body.netResult).toBe('10000000.00');
    expect(p.body.destinationPurpose).toBe('RETAINED_EARNINGS');
    expect(p.body.destinationAccount.code).toBe('370505');
    expect(p.body.lines.map((l: { accountCode: string }) => l.accountCode)).toEqual([
      '360505', '413538', '417506', '513525', '613538',
    ]);

    const res = await close(2025).expect(201);
    expect(res.body.netResult).toBe('10000000.00');
    const closing = await prisma.journalEntry.findUniqueOrThrow({ where: { id: res.body.journalEntryId } });
    expect(closing.entryDate.toISOString().slice(0, 10)).toBe('2025-12-31');

    // Las cuentas de resultado quedan en cero y el año siguiente empieza limpio
    const trial = await reports.getTrialBalance('2026-01-01', '2026-01-31');
    for (const code of ['360505', '413538', '417506', '513525', '613538']) {
      const row = trial.rows.find((r) => r.accountCode === code);
      expect(row?.initialBalance ?? '0.00', code).toBe('0.00');
    }
    expect(trial.rows.find((r) => r.accountCode === '370505')?.initialBalance).toBe('10000000.00');
  });

  it('una pérdida va a pérdidas acumuladas (3710)', async () => {
    await entry('2025-04-01', 'caja', 'ventas', '1000000.00');
    await entry('2025-04-02', 'gasto', 'caja', '1300000.00');
    const res = await close(2025).expect(201);
    expect(res.body.netResult).toBe('-300000.00');
    const lines = await prisma.journalEntryLine.findMany({ where: { journalEntryId: res.body.journalEntryId } });
    const loss = lines.find((l) => l.accountId === acc.perdidas);
    expect(loss?.debit.toFixed(2)).toBe('300000.00');
  });

  it('no se repite: un segundo cierre es conflicto hasta reversar el anterior', async () => {
    await profitableYear();
    const first = await close(2025).expect(201);
    await close(2025).expect(409);
    expect((await preview(2025).expect(200)).body.existingEntryId).toBe(first.body.journalEntryId);

    await request(app.getHttpServer())
      .post(`/api/v1/journal-entries/${first.body.journalEntryId}/reverse`)
      .set('Cookie', adminCookie)
      .send({ entryDate: '2025-12-31', reason: 'Faltaban facturas por causar' })
      .expect(201);
    await entry('2025-12-20', 'gasto', 'caja', '200000.00');
    const second = await close(2025).expect(201);
    expect(second.body.netResult).toBe('9800000.00');
  });

  it('un reintento con la misma clave devuelve el mismo cierre', async () => {
    await profitableYear();
    const key = randomUUID();
    const [a, b] = await Promise.all([close(2025, key), close(2025, key)]);
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    expect(b.body.journalEntryId).toBe(a.body.journalEntryId);
    expect(await prisma.journalEntry.count({ where: { sourceType: 'ANNUAL_CLOSING' } })).toBe(1);
  });

  it('valida año terminado, configuración, bloqueo y permisos', async () => {
    await profitableYear();
    await close(new Date().getFullYear()).expect(400);
    await close(2025, null).expect(400);
    await close(2025, randomUUID(), cashierCookie).expect(403);

    await prisma.companyAccountingMapping.updateMany({
      where: { purpose: 'RETAINED_EARNINGS' },
      data: { status: 'INACTIVE' },
    });
    const unmapped = await close(2025).expect(400);
    expect(unmapped.body.message).toMatch(/RETAINED_EARNINGS/);
    await prisma.companyAccountingMapping.updateMany({
      where: { purpose: 'RETAINED_EARNINGS' },
      data: { status: 'ACTIVE' },
    });

    await request(app.getHttpServer())
      .post('/api/v1/accounting/document-lock')
      .set('Cookie', adminCookie)
      .send({ lockedThrough: '2025-12-31', reason: 'Año revisado' })
      .expect(201);
    const locked = await close(2025).expect(400);
    expect(locked.body.message).toMatch(/bloqueados/);
    expect(await prisma.journalEntry.count({ where: { sourceType: 'ANNUAL_CLOSING' } })).toBe(0);
  });
});
