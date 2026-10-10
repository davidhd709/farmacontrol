import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { AccountingService } from '../../src/modules/accounting/application/accounting.service';
import { AccountingReportsService } from '../../src/modules/accounting/application/reports.service';
import { JournalService } from '../../src/modules/accounting/application/journal.service';

/** Naturaleza débito/crédito del PUC con PostgreSQL real: migración, trigger y reportes. */
describe('Naturaleza de las cuentas (PostgreSQL real)', () => {
  let app: INestApplication;
  let accounting: AccountingService;
  let reports: AccountingReportsService;
  let journal: JournalService;
  let userId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    accounting = module.get(AccountingService);
    reports = module.get(AccountingReportsService);
    journal = module.get(JournalService);
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
    const user = await prisma.user.create({ data: { username: 'naturaleza', passwordHash: 'x' } });
    userId = user.id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  async function account(code: string, name: string, type: 'ASSET' | 'INCOME' | 'COST', parentId?: string) {
    return prisma.account.create({
      data: { code, name, type, level: parentId ? 2 : 1, allowsMovement: !!parentId || code.length > 4, parentId },
    });
  }

  it('el trigger infiere la naturaleza en inserciones directas que no la indican', async () => {
    const ingresos = await prisma.account.create({
      data: { code: '41', name: 'OPERACIONALES', type: 'INCOME', level: 1, allowsMovement: false },
    });
    const descuentos = await prisma.account.create({
      data: {
        code: '4175',
        name: 'DEVOLUCIONES, REBAJAS Y DESCUENTOS EN VENTAS (DB) ',
        type: 'INCOME',
        level: 2,
        allowsMovement: false,
        parentId: ingresos.id,
      },
    });
    const condicionados = await prisma.account.create({
      data: { code: '417506', name: 'DESCUENTOS CONDICIONADOS', type: 'INCOME', level: 3, allowsMovement: true, parentId: descuentos.id },
    });
    const ppe = await prisma.account.create({
      data: { code: '15', name: 'PROPIEDADES', type: 'ASSET', level: 1, allowsMovement: false },
    });
    const depreciacion = await prisma.account.create({
      data: { code: '1592', name: 'DEPRECIACION ACUMULADA', type: 'ASSET', level: 2, allowsMovement: false, parentId: ppe.id },
    });
    const ventas = await prisma.account.create({
      data: { code: '4135', name: 'COMERCIO', type: 'INCOME', level: 2, allowsMovement: false, parentId: ingresos.id },
    });

    expect(ingresos.nature).toBe('CREDIT');
    expect(descuentos.nature).toBe('DEBIT');
    expect(condicionados.nature).toBe('DEBIT');
    expect(ppe.nature).toBe('DEBIT');
    expect(depreciacion.nature).toBe('CREDIT');
    expect(ventas.nature).toBe('CREDIT');
  });

  it('la API infiere la naturaleza, acepta una explícita y permite corregirla con auditoría', async () => {
    const inferred = await accounting.createAccount(
      { code: '4175', name: 'DESCUENTOS EN VENTAS (DB)', type: 'INCOME', allowsMovement: true },
      userId,
    );
    expect(inferred.nature).toBe('DEBIT');

    const explicit = await accounting.createAccount(
      { code: '5905', name: 'GANANCIAS Y PERDIDAS', type: 'EXPENSE', nature: 'CREDIT', allowsMovement: true },
      userId,
    );
    expect(explicit.nature).toBe('CREDIT');

    const fixed = await accounting.updateAccount(explicit.id, { nature: 'DEBIT' }, userId);
    expect(fixed.nature).toBe('DEBIT');
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'accounting:account_updated', entityId: explicit.id },
    });
    expect(audit).not.toBeNull();

    // La validación es síncrona: se lanza antes de abrir la transacción
    expect(() =>
      accounting.updateAccount(explicit.id, { nature: 'NEUTRA' as never }, userId),
    ).toThrow(/Naturaleza inválida/);
  });

  it('auxiliar y balance de comprobación muestran 4175 con saldo positivo por su naturaleza débito', async () => {
    const caja = await account('110505', 'CAJA GENERAL', 'ASSET');
    const descuentos = await account('417501', 'DESCUENTOS EN VENTAS (DB)', 'INCOME');
    await journal.post({
      entryDate: '2026-10-05',
      description: 'Descuento de prueba',
      sourceType: 'TEST',
      sourceId: 'naturaleza-1',
      lines: [
        { accountId: descuentos.id, debit: '2000.00', credit: '0.00' },
        { accountId: caja.id, debit: '0.00', credit: '2000.00' },
      ],
    });

    const ledger = await reports.getGeneralLedger(descuentos.id, '2026-10-01', '2026-10-31');
    expect(ledger.accountNature).toBe('DEBIT');
    expect(ledger.finalBalance).toBe('2000.00');

    const trial = await reports.getTrialBalance('2026-10-01', '2026-10-31');
    const row = trial.rows.find((r) => r.accountCode === '417501');
    expect(row?.accountNature).toBe('DEBIT');
    expect(row?.finalBalance).toBe('2000.00');
  });

  it('estado de resultados: ventas en 413595 son ventas, no descuentos; 4175 resta de las ventas', async () => {
    const caja = await account('110505', 'CAJA GENERAL', 'ASSET');
    const otrasVentas = await account('413595', 'VENTA DE OTROS PRODUCTOS', 'INCOME');
    const devoluciones = await account('417501', 'DEVOLUCIONES EN VENTAS (DB)', 'INCOME');
    await journal.post({
      entryDate: '2026-10-05',
      description: 'Venta excluida',
      sourceType: 'TEST',
      sourceId: 'naturaleza-2',
      lines: [
        { accountId: caja.id, debit: '30000.00', credit: '0.00' },
        { accountId: otrasVentas.id, debit: '0.00', credit: '30000.00' },
      ],
    });
    await journal.post({
      entryDate: '2026-10-06',
      description: 'Devolución',
      sourceType: 'TEST',
      sourceId: 'naturaleza-3',
      lines: [
        { accountId: devoluciones.id, debit: '500.00', credit: '0.00' },
        { accountId: caja.id, debit: '0.00', credit: '500.00' },
      ],
    });

    const statement = await reports.getIncomeStatement('2026-10-01', '2026-10-31');
    expect(statement.grossSales).toBe('30000.00');
    expect(statement.discounts).toBe('0.00');
    expect(statement.returns).toBe('500.00');
    expect(statement.netSales).toBe('29500.00');
  });
});
