import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma, seedRbac, AccountingPurpose, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import { FiscalPeriodsService } from '../../src/modules/accounting/application/fiscal-periods.service';
import { AccountingReportsService } from '../../src/modules/accounting/application/reports.service';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/** Cierre anual hacia la cuenta configurada por propósito, con PostgreSQL real. */
describe('Cierre anual', () => {
  let app: INestApplication;
  let journal: JournalService;
  let periods: FiscalPeriodsService;
  let reports: AccountingReportsService;
  let provisioning: UserProvisioningService;
  let auth: AuthService;
  let adminCookie: string;
  let adminId: string;
  let cashierCookie: string;
  const acc: Record<string, string> = {};

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    journal = module.get(JournalService);
    periods = module.get(FiscalPeriodsService);
    reports = module.get(AccountingReportsService);
    provisioning = module.get(UserProvisioningService);
    auth = module.get(AuthService);
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await provisioning.provisionInitialUser({
      username: 'contadora_ca',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    adminId = admin.id!;
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('contadora_ca', 'AdminPassword#2026')).rawToken}`;
    const cashier = await prisma.user.create({
      data: { username: 'cajero_ca', passwordHash: admin.passwordHash },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('cajero_ca', 'AdminPassword#2026')).rawToken}`;

    const accounts: Array<
      [
        string,
        string,
        string,
        'ASSET' | 'INCOME' | 'COST' | 'EXPENSE' | 'EQUITY',
        AccountingPurpose?,
      ]
    > = [
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
      const created = await prisma.account.create({
        data: { code, name, type, level: 1, allowsMovement: true },
      });
      acc[key] = created.id;
      if (purpose) {
        await prisma.companyAccountingMapping.create({
          data: {
            purpose,
            accountId: created.id,
            status: 'ACTIVE',
            effectiveFrom: new Date('2000-01-01'),
          },
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

  /**
   * Cierre mensual con la forma que dejaban las versiones anteriores: asiento FISCAL_CLOSING
   * cuya línea de resultado solo tiene la cuenta, sin el propósito CURRENT_YEAR_RESULT.
   */
  const legacyClosing = (
    date: string,
    sourceId: string,
    lines: Array<[key: string, debit: string, credit: string]>,
  ) =>
    journal.post({
      entryDate: date,
      description: 'Cierre contable período (versión anterior)',
      sourceType: 'FISCAL_CLOSING',
      sourceId,
      lines: lines.map(([key, debit, credit]) => ({ accountId: acc[key], debit, credit })),
    });

  /** Ejemplo de la reunión: ventas 30 M, descuentos 0,5 M, costo 18 M, gastos 1,5 M. */
  async function profitableYear() {
    await entry('2025-03-10', 'caja', 'ventas', '30000000.00');
    await entry('2025-03-10', 'descuentos', 'caja', '500000.00');
    await entry('2025-03-10', 'costo', 'caja', '18000000.00');
    await entry('2025-06-15', 'gasto', 'caja', '1500000.00');
  }

  const preview = (year: number) =>
    request(app.getHttpServer())
      .get(`/api/v1/accounting/annual-closings/preview?year=${year}`)
      .set('Cookie', adminCookie);
  const close = (year: number, key: string | null = randomUUID(), cookie = adminCookie) => {
    const req = request(app.getHttpServer())
      .post('/api/v1/accounting/annual-closings')
      .set('Cookie', cookie);
    if (key) req.set('Idempotency-Key', key);
    return req.send({ year });
  };

  it('muestra el impacto y traslada la utilidad a 3705 con fecha 31 de diciembre', async () => {
    await profitableYear();
    // Un cierre mensual previo pudo haber llevado parte del resultado a 3605
    await legacyClosing('2025-11-30', 'p-2025-11', [
      ['ventas', '1000000.00', '0.00'],
      ['resultado', '0.00', '1000000.00'],
    ]);

    const p = await preview(2025).expect(200);
    expect(p.body.entryDate).toBe('2025-12-31');
    expect(p.body.netResult).toBe('10000000.00');
    expect(p.body.destinationPurpose).toBe('RETAINED_EARNINGS');
    expect(p.body.destinationAccount.code).toBe('370505');
    expect(p.body.lines.map((l: { accountCode: string }) => l.accountCode)).toEqual([
      '360505',
      '413538',
      '417506',
      '513525',
      '613538',
    ]);

    const res = await close(2025).expect(201);
    expect(res.body.netResult).toBe('10000000.00');
    const closing = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: res.body.journalEntryId },
    });
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
    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: res.body.journalEntryId },
    });
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

  it('resuelve el destino usando la vigencia al corte y omite mappings futuros', async () => {
    await profitableYear();
    await prisma.companyAccountingMapping.deleteMany({ where: { purpose: 'RETAINED_EARNINGS' } });

    const future = await prisma.account.create({
      data: {
        code: '379998',
        name: 'Destino futuro de cierre',
        type: 'EQUITY',
        level: 1,
        allowsMovement: true,
      },
    });
    await prisma.companyAccountingMapping.create({
      data: {
        purpose: 'RETAINED_EARNINGS',
        accountId: future.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-01-01'),
      },
    });

    const historical = await prisma.account.create({
      data: {
        code: '379997',
        name: 'Destino vigente al corte',
        type: 'EQUITY',
        level: 1,
        allowsMovement: true,
      },
    });
    await prisma.companyAccountingMapping.create({
      data: {
        purpose: 'RETAINED_EARNINGS',
        accountId: historical.id,
        status: 'ACTIVE',
        effectiveFrom: new Date('2020-01-01'),
        effectiveTo: new Date('2025-12-31'),
      },
    });

    const res = await preview(2025).expect(200);
    expect(res.body.destinationAccount.id).toBe(historical.id);
    expect(await prisma.journalEntry.count({ where: { sourceType: 'ANNUAL_CLOSING' } })).toBe(0);
  });

  /**
   * Resultado de los cierres mensuales: se traslada solo lo atribuible a esos cierres, por su
   * origen, y se bloquea el cierre anual cuando la historia no permite determinarlo.
   */
  describe('resultado de los cierres mensuales', () => {
    /** Saldo al corte, positivo débito y negativo crédito. */
    const balance = async (key: string, through = '2025-12-31') => {
      const sum = await prisma.journalEntryLine.aggregate({
        where: {
          accountId: acc[key],
          journalEntry: {
            status: 'POSTED',
            entryDate: { lte: new Date(`${through}T00:00:00.000Z`) },
          },
        },
        _sum: { debit: true, credit: true },
      });
      return new Prisma.Decimal(sum._sum.debit ?? 0).minus(sum._sum.credit ?? 0).toFixed(2);
    };

    const equityAccount = async (key: string, code: string, name: string) => {
      const created = await prisma.account.create({
        data: { code, name, type: 'EQUITY', level: 1, allowsMovement: true },
      });
      acc[key] = created.id;
    };

    const period = async (month: number) => {
      await periods.generateYearPeriods(2025);
      return prisma.fiscalPeriod.findUniqueOrThrow({
        where: { year_month: { year: 2025, month } },
      });
    };
    const closeMonth = async (month: number) => {
      const p = await period(month);
      await periods.closePeriod(p.id, { generateClosingEntry: true }, adminId);
      return p;
    };

    /** Febrero: ventas 5 M y gasto 1 M, utilidad del mes 4 M. */
    async function february() {
      await entry('2025-02-10', 'caja', 'ventas', '5000000.00');
      await entry('2025-02-12', 'gasto', 'caja', '1000000.00');
    }
    const legacyFebruaryClosing = (sourceId = 'p-2025-02', resultKey = 'resultado') =>
      legacyClosing('2025-02-28', sourceId, [
        ['ventas', '5000000.00', '0.00'],
        ['gasto', '0.00', '1000000.00'],
        [resultKey, '0.00', '4000000.00'],
      ]);

    /** Confirma el cierre y comprueba equilibrio y coincidencia con la vista previa. */
    async function confirmClosing(year: number, expectedNet: string) {
      const p = await preview(year).expect(200);
      expect(p.body.netResult).toBe(expectedNet);
      const res = await close(year).expect(201);
      expect(res.body.netResult).toBe(expectedNet);
      const lines = await prisma.journalEntryLine.findMany({
        where: { journalEntryId: res.body.journalEntryId },
      });
      const debit = lines.reduce((t, l) => t.plus(l.debit), new Prisma.Decimal(0));
      const credit = lines.reduce((t, l) => t.plus(l.credit), new Prisma.Decimal(0));
      expect(debit.toFixed(2)).toBe(credit.toFixed(2));
      // Las cancelaciones confirmadas son exactamente las que mostró la vista previa
      const posted = lines
        .filter((l) => !l.purpose)
        .map((l) => `${l.accountId}:${l.debit.toFixed(2)}:${l.credit.toFixed(2)}`)
        .sort();
      const shown = (p.body.lines as Array<{ accountId: string; debit: string; credit: string }>)
        .map((l) => `${l.accountId}:${l.debit}:${l.credit}`)
        .sort();
      expect(posted).toEqual(shown);
      return { preview: p.body, lines };
    }

    /** El bloqueo se informa igual en la vista previa y al confirmar, sin dejar rastro. */
    async function expectBlocked(year: number, message: RegExp) {
      const p = await preview(year).expect(409);
      expect(p.body.message).toMatch(message);
      const key = randomUUID();
      const res = await close(year, key).expect(409);
      expect(res.body.message).toMatch(message);
      expect(await prisma.journalEntry.count({ where: { sourceType: 'ANNUAL_CLOSING' } })).toBe(0);
      expect(await prisma.idempotencyKey.count({ where: { key } })).toBe(0);
      expect(
        await prisma.auditEvent.count({ where: { action: 'accounting:annual_closing' } }),
      ).toBe(0);
    }

    it('traslada el resultado de un cierre mensual antiguo en 3605 sin propósito', async () => {
      // Las versiones anteriores elegían 3605 cuando no había mapeo de CURRENT_YEAR_RESULT
      await prisma.companyAccountingMapping.deleteMany({
        where: { purpose: 'CURRENT_YEAR_RESULT' },
      });
      await february();
      await legacyFebruaryClosing();
      await entry('2025-05-10', 'caja', 'ventas', '2000000.00');

      const { preview: p } = await confirmClosing(2025, '6000000.00');
      expect(p.lines.map((l: { accountCode: string }) => l.accountCode)).toEqual([
        '360505',
        '413538',
      ]);
      expect(await balance('resultado')).toBe('0.00');
      expect(await balance('utilidades')).toBe('-6000000.00');
    });

    it('traslada el resultado registrado en otra cuenta patrimonial', async () => {
      await equityAccount('otra', '381005', 'RESULTADOS POR CLASIFICAR');
      await february();
      await legacyFebruaryClosing('p-2025-02', 'otra');

      const { preview: p } = await confirmClosing(2025, '4000000.00');
      expect(p.lines).toEqual([
        expect.objectContaining({ accountCode: '381005', debit: '4000000.00', credit: '0.00' }),
      ]);
      expect(await balance('otra')).toBe('0.00');
    });

    it('conserva los aportes de capital de las cuentas que también recibieron resultados', async () => {
      await equityAccount('aportes', '311505', 'APORTES SOCIALES');
      await entry('2025-01-05', 'caja', 'aportes', '50000000.00');
      // Movimiento manual en la cuenta mapeada a CURRENT_YEAR_RESULT: no es resultado mensual
      await entry('2025-01-06', 'caja', 'resultado', '2000000.00');
      await february();
      await legacyFebruaryClosing('p-2025-02', 'aportes');

      const { preview: p } = await confirmClosing(2025, '4000000.00');
      expect(p.lines).toEqual([
        expect.objectContaining({ accountCode: '311505', debit: '4000000.00', credit: '0.00' }),
      ]);
      expect(await balance('aportes')).toBe('-50000000.00');
      expect(await balance('resultado')).toBe('-2000000.00');
    });

    it('con el mapeo CURRENT_YEAR_RESULT vigente traslada el cierre mensual una sola vez', async () => {
      await february();
      await closeMonth(2);
      const monthly = await prisma.journalEntryLine.findFirstOrThrow({
        where: { journalEntry: { sourceType: 'FISCAL_CLOSING' }, accountId: acc.resultado },
      });
      expect(monthly.purpose).toBe('CURRENT_YEAR_RESULT');
      await entry('2025-05-10', 'caja', 'ventas', '2000000.00');

      const { preview: p } = await confirmClosing(2025, '6000000.00');
      expect(p.lines.filter((l: { accountCode: string }) => l.accountCode === '360505')).toEqual([
        expect.objectContaining({ debit: '4000000.00', credit: '0.00' }),
      ]);
      expect(await balance('resultado')).toBe('0.00');
    });

    it('traslada el resultado aunque el mapeo haya quedado inactivo después del cierre mensual', async () => {
      await february();
      await closeMonth(2);
      await prisma.companyAccountingMapping.updateMany({
        where: { purpose: 'CURRENT_YEAR_RESULT' },
        data: { status: 'INACTIVE' },
      });

      await confirmClosing(2025, '4000000.00');
      expect(await balance('resultado')).toBe('0.00');
    });

    it('combina cierres antiguos y nuevos sin duplicar importes', async () => {
      await entry('2025-01-15', 'caja', 'ventas', '3000000.00');
      await legacyClosing('2025-01-31', 'p-2025-01', [
        ['ventas', '3000000.00', '0.00'],
        ['resultado', '0.00', '3000000.00'],
      ]);
      await february();
      await closeMonth(2);

      const { preview: p } = await confirmClosing(2025, '7000000.00');
      expect(p.lines).toEqual([
        expect.objectContaining({ accountCode: '360505', debit: '7000000.00', credit: '0.00' }),
      ]);
      expect(await balance('resultado')).toBe('0.00');
      expect(await balance('utilidades')).toBe('-7000000.00');
    });

    it('descuenta el cierre mensual reversado y traslada solo el que lo reemplazó', async () => {
      await february();
      const stale = await legacyFebruaryClosing();
      await journal.reverse({
        entryId: stale.id,
        entryDate: '2025-02-28',
        reason: 'Faltaba una venta del mes',
      });
      await entry('2025-02-20', 'caja', 'ventas', '500000.00');
      await legacyClosing('2025-02-28', 'p-2025-02:2', [
        ['ventas', '5500000.00', '0.00'],
        ['gasto', '0.00', '1000000.00'],
        ['resultado', '0.00', '4500000.00'],
      ]);

      const { preview: p } = await confirmClosing(2025, '4500000.00');
      expect(p.lines).toEqual([
        expect.objectContaining({ accountCode: '360505', debit: '4500000.00', credit: '0.00' }),
      ]);
      expect(await balance('resultado')).toBe('0.00');
    });

    it('bloquea cuando un cierre mensual se reversó con fecha de otro año', async () => {
      await february();
      const closing = await legacyFebruaryClosing();
      await journal.reverse({
        entryId: closing.id,
        entryDate: '2026-01-15',
        reason: 'Reversión tardía',
      });
      await expectBlocked(2025, /tiene una reversión fechada el 2026-01-15, fuera del año/);
    });

    it('bloquea cuando un período tiene más de un cierre mensual vigente', async () => {
      await february();
      await legacyFebruaryClosing('p-2025-02');
      await legacyFebruaryClosing('p-2025-02:2');
      await expectBlocked(2025, /2 cierres mensuales vigentes/);
    });

    it('reabrir un período y volver a cerrarlo traslada solo el último resultado', async () => {
      await february();
      const feb = await closeMonth(2);
      await periods.reopenPeriod(feb.id, { reason: 'Faltaba registrar una venta' }, adminId);
      await entry('2025-02-25', 'caja', 'ventas', '1000000.00');
      await periods.closePeriod(feb.id, { generateClosingEntry: true }, adminId);
      expect(await prisma.journalEntry.count({ where: { sourceType: 'FISCAL_CLOSING' } })).toBe(2);

      const { preview: p } = await confirmClosing(2025, '5000000.00');
      expect(p.lines).toEqual([
        expect.objectContaining({ accountCode: '360505', debit: '5000000.00', credit: '0.00' }),
      ]);
      expect(await balance('resultado')).toBe('0.00');
    });

    it('un ejercicio con pérdida mensual la traslada a pérdidas acumuladas', async () => {
      await entry('2025-02-10', 'caja', 'ventas', '1000000.00');
      await entry('2025-02-12', 'gasto', 'caja', '1500000.00');
      await closeMonth(2);

      const { preview: p, lines } = await confirmClosing(2025, '-500000.00');
      expect(p.destinationPurpose).toBe('ACCUMULATED_LOSSES');
      expect(lines.find((l) => l.accountId === acc.perdidas)?.debit.toFixed(2)).toBe('500000.00');
      expect(await balance('resultado')).toBe('0.00');
      expect(await balance('perdidas')).toBe('500000.00');
    });

    it('un reintento con la misma clave no vuelve a trasladar el resultado mensual', async () => {
      await february();
      await legacyFebruaryClosing();
      const key = randomUUID();
      const [a, b] = await Promise.all([close(2025, key), close(2025, key)]);
      expect(a.status, JSON.stringify(a.body)).toBe(201);
      expect(b.status, JSON.stringify(b.body)).toBe(201);
      expect(b.body.journalEntryId).toBe(a.body.journalEntryId);
      const again = await close(2025, key).expect(201);
      expect(again.body.journalEntryId).toBe(a.body.journalEntryId);
      expect(await prisma.journalEntry.count({ where: { sourceType: 'ANNUAL_CLOSING' } })).toBe(1);
      expect(await balance('resultado')).toBe('0.00');
      expect(await balance('utilidades')).toBe('-4000000.00');
    });

    const reverseTwice = async (entryId: string, date = '2025-02-28') => {
      const first = await journal.reverse({ entryId, entryDate: date, reason: 'Reversión' });
      return journal.reverse({ entryId: first.id, entryDate: date, reason: 'Se restablece' });
    };

    it('un cierre mensual cuya reversión también se reversó sigue vigente y se traslada', async () => {
      await february();
      const closing = await legacyFebruaryClosing();
      await reverseTwice(closing.id);

      const { preview: p } = await confirmClosing(2025, '4000000.00');
      expect(p.lines).toEqual([
        expect.objectContaining({ accountCode: '360505', debit: '4000000.00', credit: '0.00' }),
      ]);
      expect(await balance('resultado')).toBe('0.00');
    });

    it('bloquea un cierre restablecido que convive con el cierre que lo reemplazó', async () => {
      await february();
      const closing = await legacyFebruaryClosing('p-2025-02');
      await reverseTwice(closing.id);
      await legacyFebruaryClosing('p-2025-02:2');
      await expectBlocked(2025, /2 cierres mensuales vigentes/);
    });

    it('bloquea el mismo caso con cierres actuales marcados con CURRENT_YEAR_RESULT', async () => {
      await february();
      const feb = await closeMonth(2);
      const closing = await prisma.journalEntry.findFirstOrThrow({
        where: { sourceType: 'FISCAL_CLOSING', sourceId: feb.id },
      });
      // La reapertura reversa el cierre; reversar esa reversión lo deja vigente otra vez
      await periods.reopenPeriod(feb.id, { reason: 'Revisión de ventas del mes' }, adminId);
      const reopened = await prisma.journalEntry.findUniqueOrThrow({
        where: { reversalOfId: closing.id },
      });
      await journal.reverse({
        entryId: reopened.id,
        entryDate: '2025-02-28',
        reason: 'Se restablece el cierre',
      });
      await entry('2025-02-25', 'caja', 'ventas', '1000000.00');
      await periods.closePeriod(feb.id, { generateClosingEntry: true }, adminId);
      expect(
        await prisma.journalEntry.count({
          where: { sourceType: 'FISCAL_CLOSING', sourceId: `${feb.id}:2` },
        }),
      ).toBe(1);
      await expectBlocked(2025, /2 cierres mensuales vigentes/);
    });

    it('un cierre anual restablecido tras reversar su reversión impide un segundo cierre', async () => {
      await february();
      await legacyFebruaryClosing();
      const first = await close(2025).expect(201);
      await reverseTwice(first.body.journalEntryId, '2025-12-31');

      expect((await preview(2025).expect(200)).body.existingEntryId).toBe(
        first.body.journalEntryId,
      );
      await close(2025).expect(409);
      expect(await balance('resultado')).toBe('0.00');
      expect(await balance('utilidades')).toBe('-4000000.00');
    });

    it('bloquea un cierre mensual que mueve cuentas que no son de resultado ni patrimonio', async () => {
      await entry('2025-02-10', 'caja', 'ventas', '1000000.00');
      await legacyClosing('2025-02-28', 'p-2025-02', [
        ['ventas', '1000000.00', '0.00'],
        ['caja', '0.00', '1000000.00'],
      ]);
      await expectBlocked(2025, /mueve la cuenta 110505/);
    });

    it('bloquea mientras un año anterior tenga resultado mensual sin cierre anual', async () => {
      await entry('2024-06-10', 'caja', 'ventas', '1000000.00');
      await legacyClosing('2024-06-30', 'p-2024-06', [
        ['ventas', '1000000.00', '0.00'],
        ['resultado', '0.00', '1000000.00'],
      ]);
      await february();
      await expectBlocked(2025, /el año 2024 tiene resultado de cierres mensuales/);

      await confirmClosing(2024, '1000000.00');
      await confirmClosing(2025, '4000000.00');
      expect(await balance('resultado')).toBe('0.00');
      expect(await balance('utilidades')).toBe('-5000000.00');
    });
  });
});
