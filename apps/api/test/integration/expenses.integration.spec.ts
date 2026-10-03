import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { prisma, cleanTestDatabase, seedRbac, AccountingPurpose as DbPurpose } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { ExpensesService } from '../../src/modules/expenses/application/expenses.service';
import { ExpenseCategoriesService } from '../../src/modules/expenses/application/expense-categories.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

describe('Expenses Module Integration (PostgreSQL)', () => {
  let app: INestApplication;
  let cookie: string;
  let cashierCookie: string;
  let adminUserId: string;
  let expensesService: ExpensesService;
  let categoriesService: ExpenseCategoriesService;

  beforeAll(async () => {
    await cleanTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const provisioning = module.get(UserProvisioningService);
    const auth = module.get(AuthService);
    expensesService = module.get(ExpensesService);
    categoriesService = module.get(ExpenseCategoriesService);

    await cleanTestDatabase();
    await seedRbac(prisma);

    const user = await provisioning.provisionInitialUser({
      username: 'expenses_admin',
      password: 'AdminPassword#2026',
    });
    adminUserId = user.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: user.id!, roleId: adminRole.id } });
    const login = await auth.login('expenses_admin', 'AdminPassword#2026');
    cookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;

    const cashier = await prisma.user.create({
      data: { username: 'expenses_cashier', passwordHash: user.passwordHash },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('expenses_cashier', 'AdminPassword#2026')).rawToken}`;
  }, 45000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 45000);

  async function setupPucAndTreasury() {
    // 1. Cuentas base
    const accountsData: Array<{ code: string; name: string; type: any; purpose?: DbPurpose }> = [
      { code: '110505', name: 'Caja General', type: 'ASSET', purpose: 'CASH' },
      { code: '111005', name: 'Bancos Nacionales', type: 'ASSET', purpose: 'BANK' },
      { code: '220505', name: 'Proveedores Nacionales', type: 'LIABILITY', purpose: 'SUPPLIERS' },
      { code: '513525', name: 'Acueducto y Alcantarillado', type: 'EXPENSE' },
      { code: '513530', name: 'Energía Eléctrica', type: 'EXPENSE' },
      { code: '519530', name: 'Papelería y Útiles', type: 'EXPENSE' },
    ];

    const createdAccounts = new Map<string, string>();

    for (const acc of accountsData) {
      const created = await prisma.account.create({
        data: {
          code: acc.code,
          name: acc.name,
          type: acc.type,
          level: 1,
          allowsMovement: true,
          isActive: true,
        },
      });
      createdAccounts.set(acc.code, created.id);

      if (acc.purpose) {
        await prisma.companyAccountingMapping.create({
          data: {
            purpose: acc.purpose,
            accountId: created.id,
            status: 'ACTIVE',
            effectiveFrom: new Date('2020-01-01'),
          },
        });
      }
    }

    // 2. Cuenta bancaria con saldo inicial
    const bankAccount = await prisma.bankAccount.create({
      data: {
        bankName: 'Bancolombia',
        accountType: 'Ahorros',
        accountNumber: '9876543210',
        name: 'Cuenta Operativa Farmacia',
        initialBalance: 5000000.0,
        currentBalance: 5000000.0,
        currency: 'COP',
        isActive: true,
        createdById: adminUserId,
      },
    });

    // 3. Fondo inicial en caja para permitir desembolsos de prueba
    await prisma.cashMovement.create({
      data: {
        movementType: 'INGRESO_MANUAL',
        amount: 2000000.0,
        balanceAfter: 2000000.0,
        paymentMethod: 'EFECTIVO',
        reason: 'Fondo de apertura para pruebas',
        createdByUserId: adminUserId,
      },
    });

    return { accounts: createdAccounts, bankAccount };
  }

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "expense_payments", "expenses", "expense_categories", "bank_movements", "bank_accounts", "journal_entry_lines", "journal_entries", "company_accounting_mappings", "accounts", "cash_movements" CASCADE`;
  });

  describe('Categorías de Gastos', () => {
    it('crea categoría vinculada a cuenta contable de tipo EXPENSE', async () => {
      const { accounts } = await setupPucAndTreasury();
      const accountId = accounts.get('513530')!;

      const res = await request(app.getHttpServer())
        .post('/api/v1/expense-categories')
        .set('Cookie', cookie)
        .send({
          name: 'Energía Eléctrica',
          description: 'Facturas de servicio de energía',
          accountId,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Energía Eléctrica');
      expect(res.body.accountCode).toBe('513530');
    });

    it('rechaza crear categoría vinculada a cuenta que no sea EXPENSE ni COST', async () => {
      const { accounts } = await setupPucAndTreasury();
      const assetAccountId = accounts.get('110505')!; // Caja General (ASSET)

      const res = await request(app.getHttpServer())
        .post('/api/v1/expense-categories')
        .set('Cookie', cookie)
        .send({
          name: 'Categoría Inválida',
          accountId: assetAccountId,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('debe ser de tipo GASTO (EXPENSE) o COSTO (COST)');
    });

    it('rechaza duplicar nombre de categoría', async () => {
      const { accounts } = await setupPucAndTreasury();
      const accountId = accounts.get('513530')!;

      await categoriesService.create({ name: 'Servicios Públicos', accountId });

      const res = await request(app.getHttpServer())
        .post('/api/v1/expense-categories')
        .set('Cookie', cookie)
        .send({
          name: 'Servicios Públicos',
          accountId,
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Ya existe una categoría');
    });
  });

  describe('Registro de Gastos y Causación Contable', () => {
    it('registra gasto de contado en efectivo: descuenta caja y genera asiento balanceado (Gasto vs CASH)', async () => {
      const { accounts } = await setupPucAndTreasury();
      const category = await categoriesService.create({
        name: 'Papelería y Útiles',
        accountId: accounts.get('519530')!,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Cookie', cookie)
        .send({
          categoryId: category.id,
          description: 'Compra de resmas de papel para caja',
          beneficiary: 'Papelería El Sol',
          documentNumber: 'PAP-1020',
          amount: '50000.00',
          expenseDate: '2026-10-01',
          paymentMethod: 'EFECTIVO',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAGADO');
      expect(res.body.balance).toBe('0.00');
      expect(res.body.amountPaid).toBe('50000.00');

      // 1. Movimiento de caja registrado
      const cashMov = await prisma.cashMovement.findFirst({
        where: { referenceDocumentType: 'EXPENSE', referenceDocumentId: res.body.id },
      });
      expect(cashMov).toBeDefined();
      expect(cashMov?.movementType).toBe('EGRESO_MANUAL');
      expect(cashMov?.amount.toFixed(2)).toBe('50000.00');

      // 2. Asiento contable en Libro Diario
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { sourceType_sourceId: { sourceType: 'EXPENSE', sourceId: res.body.id } },
        include: { lines: { include: { account: true } } },
      });
      expect(journalEntry).toBeDefined();
      expect(journalEntry?.status).toBe('POSTED');
      expect(journalEntry?.lines.length).toBe(2);

      const debitLine = journalEntry?.lines.find((l) => Number(l.debit) > 0);
      const creditLine = journalEntry?.lines.find((l) => Number(l.credit) > 0);
      expect(debitLine?.accountId).toBe(accounts.get('519530'));
      expect(debitLine?.debit.toFixed(2)).toBe('50000.00');
      expect(creditLine?.purpose).toBe('CASH');
      expect(creditLine?.credit.toFixed(2)).toBe('50000.00');
    });

    it('registra gasto de contado por banco: descuenta saldo bancario y genera asiento balanceado (Gasto vs BANK)', async () => {
      const { accounts, bankAccount } = await setupPucAndTreasury();
      const category = await categoriesService.create({
        name: 'Energía Eléctrica',
        accountId: accounts.get('513530')!,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Cookie', cookie)
        .send({
          categoryId: category.id,
          description: 'Factura de luz mes de septiembre',
          beneficiary: 'Enel Colombia',
          documentNumber: 'EN-8899',
          amount: '350000.00',
          expenseDate: '2026-10-01',
          paymentMethod: 'TRANSFERENCIA',
          bankAccountId: bankAccount.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAGADO');

      // 1. Saldo bancario disminuido
      const updatedBank = await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankAccount.id } });
      expect(updatedBank.currentBalance.toFixed(2)).toBe('4650000.00');

      // 2. Movimiento bancario de retiro
      const bankMov = await prisma.bankMovement.findFirst({
        where: { referenceDocumentType: 'EXPENSE', referenceDocumentId: res.body.id },
      });
      expect(bankMov).toBeDefined();
      expect(bankMov?.movementType).toBe('WITHDRAWAL');
      expect(bankMov?.amount.toFixed(2)).toBe('350000.00');

      // 3. Asiento contable
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { sourceType_sourceId: { sourceType: 'EXPENSE', sourceId: res.body.id } },
        include: { lines: true },
      });
      expect(journalEntry?.status).toBe('POSTED');
      const creditLine = journalEntry?.lines.find((l) => Number(l.credit) > 0);
      expect(creditLine?.purpose).toBe('BANK');
      expect(creditLine?.credit.toFixed(2)).toBe('350000.00');
    });

    it('registra gasto a crédito (pendiente): causa obligación contra SUPPLIERS y estado PENDIENTE', async () => {
      const { accounts } = await setupPucAndTreasury();
      const category = await categoriesService.create({
        name: 'Agua y Alcantarillado',
        accountId: accounts.get('513525')!,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Cookie', cookie)
        .send({
          categoryId: category.id,
          description: 'Factura de acueducto con vencimiento a fin de mes',
          beneficiary: 'Empresa de Acueducto',
          documentNumber: 'AC-3344',
          amount: '200000.00',
          expenseDate: '2026-10-01',
          dueDate: '2026-10-30',
          paymentMethod: 'CREDITO',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDIENTE');
      expect(res.body.balance).toBe('200000.00');
      expect(res.body.amountPaid).toBe('0.00');

      // Asiento contable: Gasto vs SUPPLIERS
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { sourceType_sourceId: { sourceType: 'EXPENSE', sourceId: res.body.id } },
        include: { lines: true },
      });
      expect(journalEntry?.status).toBe('POSTED');
      const debitLine = journalEntry?.lines.find((l) => Number(l.debit) > 0);
      const creditLine = journalEntry?.lines.find((l) => Number(l.credit) > 0);
      expect(debitLine?.accountId).toBe(accounts.get('513525'));
      expect(creditLine?.purpose).toBe('SUPPLIERS');
      expect(creditLine?.credit.toFixed(2)).toBe('200000.00');
    });
  });

  describe('Pago Posterior de Gasto y Reversión', () => {
    it('abona a gasto pendiente: debita SUPPLIERS, acredita CASH y NO duplica el gasto', async () => {
      const { accounts } = await setupPucAndTreasury();
      const category = await categoriesService.create({
        name: 'Servicios Varios',
        accountId: accounts.get('513525')!,
      });

      const expense = await expensesService.createExpense(
        {
          categoryId: category.id,
          description: 'Factura Acueducto pendiente',
          beneficiary: 'Acueducto S.A.',
          documentNumber: 'FAC-99',
          amount: '200000.00',
          expenseDate: '2026-10-01',
          dueDate: '2026-10-20',
          paymentMethod: 'CREDITO',
        },
        adminUserId,
      );

      // Abono parcial de $120.000 en efectivo
      const payRes = await request(app.getHttpServer())
        .post(`/api/v1/expenses/${expense.id}/payments`)
        .set('Cookie', cookie)
        .send({
          amount: '120000.00',
          paymentDate: '2026-10-05',
          paymentMethod: 'EFECTIVO',
          notes: 'Primer abono en efectivo',
        });

      expect(payRes.status).toBe(201);
      expect(payRes.body.status).toBe('PENDIENTE');
      expect(payRes.body.balance).toBe('80000.00');
      expect(payRes.body.amountPaid).toBe('120000.00');
      expect(payRes.body.payments.length).toBe(1);

      // Asiento del pago: Débito a SUPPLIERS, Crédito a CASH. NO afecta la cuenta de gasto.
      const paymentId = payRes.body.payments[0].id;
      const paymentJournal = await prisma.journalEntry.findUnique({
        where: { sourceType_sourceId: { sourceType: 'EXPENSE_PAYMENT', sourceId: paymentId } },
        include: { lines: true },
      });
      expect(paymentJournal).toBeDefined();
      expect(paymentJournal?.status).toBe('POSTED');

      const debitLine = paymentJournal?.lines.find((l) => Number(l.debit) > 0);
      const creditLine = paymentJournal?.lines.find((l) => Number(l.credit) > 0);
      expect(debitLine?.purpose).toBe('SUPPLIERS');
      expect(debitLine?.debit.toFixed(2)).toBe('120000.00');
      expect(creditLine?.purpose).toBe('CASH');
      expect(creditLine?.credit.toFixed(2)).toBe('120000.00');

      // Segundo pago por saldo restante ($80.000)
      const payFinal = await request(app.getHttpServer())
        .post(`/api/v1/expenses/${expense.id}/payments`)
        .set('Cookie', cookie)
        .send({
          amount: '80000.00',
          paymentDate: '2026-10-10',
          paymentMethod: 'EFECTIVO',
        });

      expect(payFinal.status).toBe(201);
      expect(payFinal.body.status).toBe('PAGADO');
      expect(payFinal.body.balance).toBe('0.00');
      expect(payFinal.body.amountPaid).toBe('200000.00');
    });

    it('reversa pago de gasto: restituye saldo, devuelve fondos a tesorería y genera asiento compensatorio', async () => {
      const { accounts } = await setupPucAndTreasury();
      const category = await categoriesService.create({
        name: 'Mantenimiento',
        accountId: accounts.get('513530')!,
      });

      const expense = await expensesService.createExpense(
        {
          categoryId: category.id,
          description: 'Mantenimiento preventivo aire',
          beneficiary: 'Técnico Clima',
          amount: '150000.00',
          expenseDate: '2026-10-01',
          dueDate: '2026-10-15',
          paymentMethod: 'CREDITO',
        },
        adminUserId,
      );

      const paidExpense = await expensesService.payExpense(
        expense.id,
        {
          amount: '150000.00',
          paymentDate: '2026-10-05',
          paymentMethod: 'EFECTIVO',
        },
        adminUserId,
      );

      expect(paidExpense.status).toBe('PAGADO');
      const paymentId = paidExpense.payments[0].id;

      // Revertir pago
      const revRes = await request(app.getHttpServer())
        .post(`/api/v1/expenses/payments/${paymentId}/reverse`)
        .set('Cookie', cookie)
        .send({
          reversalReason: 'Pago registrado por error en efectivo',
        });

      expect(revRes.status).toBe(201);
      expect(revRes.body.status).toBe('PENDIENTE');
      expect(revRes.body.balance).toBe('150000.00');
      expect(revRes.body.amountPaid).toBe('0.00');

      // Trazabilidad del pago marcada como revertida
      const p = revRes.body.payments.find((x: any) => x.id === paymentId);
      expect(p.isReversed).toBe(true);
      expect(p.reversalReason).toBe('Pago registrado por error en efectivo');

      // Asiento contable de compensación (reversalOfId)
      const originalEntry = await prisma.journalEntry.findUniqueOrThrow({
        where: { sourceType_sourceId: { sourceType: 'EXPENSE_PAYMENT', sourceId: paymentId } },
      });
      const reversalEntry = await prisma.journalEntry.findFirst({
        where: { reversalOfId: originalEntry.id },
      });
      expect(reversalEntry).toBeDefined();
      expect(reversalEntry?.status).toBe('POSTED');
    });

    it('anula gasto de contado restituyendo fondos a tesorería y revirtiendo asiento contable', async () => {
      const { accounts } = await setupPucAndTreasury();
      const category = await categoriesService.create({
        name: 'Papelería',
        accountId: accounts.get('519530')!,
      });

      const expense = await expensesService.createExpense(
        {
          categoryId: category.id,
          description: 'Compra de tintas',
          beneficiary: 'Suministros Tech',
          amount: '80000.00',
          expenseDate: '2026-10-01',
          paymentMethod: 'EFECTIVO',
        },
        adminUserId,
      );

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/expenses/${expense.id}/cancel`)
        .set('Cookie', cookie)
        .send({
          cancellationReason: 'Proveedor canceló la entrega y devolvió el dinero',
        });

      expect(cancelRes.status).toBe(201);
      expect(cancelRes.body.status).toBe('ANULADO');

      // Reintegro a caja
      const refundCash = await prisma.cashMovement.findFirst({
        where: { referenceDocumentType: 'EXPENSE_CANCEL', referenceDocumentId: expense.id },
      });
      expect(refundCash).toBeDefined();
      expect(refundCash?.movementType).toBe('INGRESO_MANUAL');

      // Asiento contable compensatorio
      const originalEntry = await prisma.journalEntry.findUniqueOrThrow({
        where: { sourceType_sourceId: { sourceType: 'EXPENSE', sourceId: expense.id } },
      });
      const reversalEntry = await prisma.journalEntry.findFirst({
        where: { reversalOfId: originalEntry.id },
      });
      expect(reversalEntry).toBeDefined();
    });
  });

  describe('Reportes, Filtros y Seguridad RBAC', () => {
    it('calcula KPIs acumulados en el endpoint de resumen', async () => {
      const { accounts } = await setupPucAndTreasury();
      const catLuz = await categoriesService.create({ name: 'Energía', accountId: accounts.get('513530')! });
      const catAgua = await categoriesService.create({ name: 'Agua', accountId: accounts.get('513525')! });

      // 1 pagado
      await expensesService.createExpense(
        {
          categoryId: catLuz.id,
          description: 'Luz oficina',
          beneficiary: 'Enel',
          amount: '100000.00',
          expenseDate: '2026-10-01',
          paymentMethod: 'EFECTIVO',
        },
        adminUserId,
      );

      // 1 pendiente
      await expensesService.createExpense(
        {
          categoryId: catAgua.id,
          description: 'Agua mensual',
          beneficiary: 'Acueducto',
          amount: '50000.00',
          expenseDate: '2026-10-01',
          dueDate: '2026-10-25',
          paymentMethod: 'CREDITO',
        },
        adminUserId,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/expenses/summary')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.totalAmount).toBe('150000.00');
      expect(res.body.totalPaid).toBe('100000.00');
      expect(res.body.totalPending).toBe('50000.00');
      expect(res.body.count).toBe(2);
      expect(res.body.categoriesBreakdown.length).toBe(2);
    });

    it('rechaza operaciones de gestión de gastos a usuarios sin permiso expenses:manage', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/expenses')
        .set('Cookie', cashierCookie)
        .send({
          categoryId: '00000000-0000-0000-0000-000000000000',
          description: 'Test sin permisos',
          beneficiary: 'Tercero',
          amount: '10000.00',
          paymentMethod: 'EFECTIVO',
        });

      expect(res.status).toBe(403);
    });
  });
});
