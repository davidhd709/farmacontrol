import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma, AccountingPurpose } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { TreasuryService } from '../../src/modules/treasury/application/treasury.service';
import { AccountingEngineService } from '../../src/modules/accounting/application/accounting-engine.service';

/** Cuentas bancarias creadas desde su subcuenta del PUC (acuerdo del 4 de octubre). */
describe('Cuentas bancarias vinculadas al PUC', () => {
  let app: INestApplication;
  let treasury: TreasuryService;
  let engine: AccountingEngineService;
  let userId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    treasury = module.get(TreasuryService);
    engine = module.get(AccountingEngineService);
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
    userId = (await prisma.user.create({ data: { username: 'tesoreria_puc', passwordHash: 'x' } })).id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const account = (code: string, name: string, type: 'ASSET' | 'LIABILITY' = 'ASSET', allowsMovement = true) =>
    prisma.account.create({ data: { code, name, type, level: 1, allowsMovement } });

  async function map(purpose: AccountingPurpose, accountId: string) {
    await prisma.companyAccountingMapping.create({
      data: { purpose, accountId, status: 'ACTIVE', effectiveFrom: new Date('2020-01-01') },
    });
  }

  const bankDto = (ledgerAccountId: unknown, accountNumber = '68095832443') => ({
    bankName: 'Bancolombia',
    accountType: 'AHORROS' as const,
    accountNumber,
    name: 'Cta Aho principal',
    ledgerAccountId: ledgerAccountId as string,
  });

  it('crea la cuenta bancaria a partir de una subcuenta de bancos imputable', async () => {
    const ledger = await account('11200501', 'BANCOLOMBIA CTA AHO 68095832443');
    const created = await treasury.createAccount(bankDto(ledger.id), userId);
    expect(created.ledgerAccountId).toBe(ledger.id);
    expect(created.ledgerAccountCode).toBe('11200501');
  });

  it('rechaza la caja, cuentas agrupadoras, otras clases, subcuentas repetidas o ausentes', async () => {
    const caja = await account('110505', 'CAJA GENERAL');
    const grupo = await account('1120', 'CUENTAS DE AHORRO', 'ASSET', false);
    const pasivo = await account('210505', 'BANCOS NACIONALES', 'LIABILITY');
    const ledger = await account('11200501', 'BANCOLOMBIA');

    await expect(treasury.createAccount(bankDto(caja.id), userId)).rejects.toThrow(/subcuenta de bancos/);
    await expect(treasury.createAccount(bankDto(grupo.id), userId)).rejects.toThrow(/permitir movimientos/);
    await expect(treasury.createAccount(bankDto(pasivo.id), userId)).rejects.toThrow(/subcuenta de bancos/);
    await expect(treasury.createAccount(bankDto(undefined), userId)).rejects.toThrow(/Subcuenta del PUC/);

    await treasury.createAccount(bankDto(ledger.id), userId);
    await expect(treasury.createAccount(bankDto(ledger.id, '999'), userId)).rejects.toThrow(/ya está asignada/);
  });

  it('una cuenta bancaria existente sin vínculo se vincula al editarla', async () => {
    const legacy = await prisma.bankAccount.create({
      data: { bankName: 'Davivienda', accountType: 'CORRIENTE', accountNumber: '123', name: 'Antigua', createdById: userId },
    });
    const ledger = await account('11100501', 'DAVIVIENDA CTE');
    const updated = await treasury.updateAccount(legacy.id, { ledgerAccountId: ledger.id }, userId);
    expect(updated.ledgerAccountCode).toBe('11100501');
  });

  it('el asiento del cobro por transferencia usa la subcuenta del banco, sin depender del mapeo BANK', async () => {
    const ledger = await account('11200501', 'BANCOLOMBIA');
    const clientes = await account('130505', 'CLIENTES');
    await map('CUSTOMERS', clientes.id);
    const bank = await treasury.createAccount(bankDto(ledger.id), userId);

    const posted = await engine.handleCustomerPayment({
      id: '44444444-4444-4444-4444-444444444444',
      receivableId: '55555555-5555-5555-5555-555555555555',
      amount: '50000.00',
      paymentMethod: 'TRANSFERENCIA',
      bankAccountId: bank.id,
      createdByUserId: userId,
    });
    expect(posted).not.toBeNull();
    const bankLine = posted!.lines.find((l) => l.purpose === 'BANK');
    expect(bankLine?.accountId).toBe(ledger.id);
    expect(bankLine?.debit.toFixed(2)).toBe('50000.00');
  });

  it('sin vínculo conserva el propósito genérico BANK', async () => {
    const generic = await account('111005', 'BANCOS NACIONALES');
    const clientes = await account('130505', 'CLIENTES');
    await map('CUSTOMERS', clientes.id);
    await map('BANK', generic.id);
    const legacy = await prisma.bankAccount.create({
      data: { bankName: 'Nequi', accountType: 'DIGITAL', accountNumber: '300', name: 'Nequi', createdById: userId },
    });

    const posted = await engine.handleCustomerPayment({
      id: '66666666-6666-6666-6666-666666666666',
      receivableId: '77777777-7777-7777-7777-777777777777',
      amount: '1000.00',
      paymentMethod: 'TRANSFERENCIA',
      bankAccountId: legacy.id,
      createdByUserId: userId,
    });
    expect(posted!.lines.find((l) => l.purpose === 'BANK')?.accountId).toBe(generic.id);
  });
});
