import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { AccountingService } from '../../src/modules/accounting/application/accounting.service';
import { AccountingRepository } from '../../src/modules/accounting/infrastructure/accounting.repository';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

async function file(rows: unknown[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Plan');
  sheet.addRow([
    'Código',
    'Nombre',
    'Tipo',
    'Código Padre',
    'Permite Movimiento',
    'Estado',
    'Propósito Contable',
  ]);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('Accounting 11.1 PostgreSQL', () => {
  let app: INestApplication;
  let cookie: string;
  let cashierCookie: string;
  let accounting: AccountingService;
  let repository: AccountingRepository;
  let provisioning: UserProvisioningService;
  let auth: AuthService;
  beforeAll(async () => {
    await cleanTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    provisioning = module.get(UserProvisioningService);
    auth = module.get(AuthService);
    accounting = module.get(AccountingService);
    repository = module.get(AccountingRepository);
  }, 30000);
  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
    const user = await provisioning.provisionInitialUser({
      username: 'account_admin',
      password: 'AdminPassword#2026',
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: user.id!, roleId: role.id } });
    const login = await auth.login('account_admin', 'AdminPassword#2026');
    cookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;
    const cashier = await prisma.user.create({
      data: { username: 'account_cashier', passwordHash: user.passwordHash },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('account_cashier', 'AdminPassword#2026')).rawToken}`;
  }, 30000);
  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
    await prisma.$disconnect();
  }, 30000);
  it('protege acceso y valida jerarquía y mapeos', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/accounts')).status).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/accounts')
          .set('Cookie', cashierCookie)
          .send({ code: '1', name: 'Activo', type: 'ASSET', allowsMovement: false })
      ).status,
    ).toBe(403);
    const create = (code: string, parentId?: string) =>
      request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Cookie', cookie)
        .send({ code, name: code, type: 'ASSET', parentId, allowsMovement: !!parentId });
    const root = await create('1');
    expect(root.status).toBe(201);
    expect((await create('1')).status).toBe(409);
    expect((await create('1105', '00000000-0000-0000-0000-000000000000')).status).toBe(404);
    const leaf = await create('1105', root.body.id);
    expect(leaf.status).toBe(201);
    expect(leaf.body.level).toBe(2);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/v1/accounts/${root.body.id}`)
          .set('Cookie', cookie)
          .send({ parentId: root.body.id })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .put('/api/v1/accounting/purposes/CASH')
          .set('Cookie', cookie)
          .send({ accountId: leaf.body.id })
      ).status,
    ).toBe(200);
    expect((await accounting.resolveAccountByPurpose('CASH')).id).toBe(leaf.body.id);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/v1/accounts/${root.body.id}`)
          .set('Cookie', cookie)
          .send({ parentId: leaf.body.id })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/v1/accounts/${leaf.body.id}`)
          .set('Cookie', cookie)
          .send({ isActive: false })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/accounting/configuration-status')
          .set('Cookie', cookie)
      ).body.configured,
    ).toBe(1);
  });
  it('permite inactivar sin uso y rechaza mapear una cuenta inactiva', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Cookie', cookie)
      .send({ code: '110505', name: 'Caja general', type: 'ASSET', allowsMovement: true });
    expect(created.status).toBe(201);
    const inactive = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${created.body.id}`)
      .set('Cookie', cookie)
      .send({ isActive: false });
    expect(inactive.status).toBe(200);
    expect(inactive.body.isActive).toBe(false);
    const map = await request(app.getHttpServer())
      .put('/api/v1/accounting/purposes/CASH')
      .set('Cookie', cookie)
      .send({ accountId: created.body.id });
    expect(map.status).toBe(400);
    await expect(accounting.resolveAccountByPurpose('CASH')).rejects.toThrow('CASH');
  });
  it('previsualiza sin escritura, confirma una vez y rechaza filas inválidas', async () => {
    const valid = await file([
      ['1', 'Activo', 'ASSET', '', 'NO', 'ACTIVO', ''],
      ['1105', 'Caja', 'ASSET', '1', 'SI', 'ACTIVO', 'CASH'],
    ]);
    const preview = await request(app.getHttpServer())
      .post('/api/v1/accounts/import/preview')
      .set('Cookie', cookie)
      .attach('file', valid, 'plan.xlsx');
    expect(preview.body.validCount).toBe(2);
    expect(await prisma.account.count()).toBe(0);
    const confirm = () =>
      request(app.getHttpServer())
        .post('/api/v1/accounts/import/confirm')
        .set('Cookie', cookie)
        .field('previewHash', preview.body.previewHash)
        .attach('file', valid, 'plan.xlsx');
    expect((await confirm()).body.importedCount).toBe(2);
    expect(await prisma.account.count()).toBe(2);
    expect((await confirm()).status).toBe(400);
    const invalid = await file([
      ['2', 'Otro', 'ASSET', '', 'NO', 'ACTIVO', ''],
      ['2205', 'Proveedor', 'LIABILITY', '22', 'SI', 'ACTIVO', ''],
    ]);
    const bad = await request(app.getHttpServer())
      .post('/api/v1/accounts/import/preview')
      .set('Cookie', cookie)
      .attach('file', invalid, 'plan.xlsx');
    expect(bad.body.errorCount).toBe(1);
    const failed = await request(app.getHttpServer())
      .post('/api/v1/accounts/import/confirm')
      .set('Cookie', cookie)
      .field('previewHash', bad.body.previewHash)
      .attach('file', invalid, 'plan.xlsx');
    expect(failed.status).toBe(400);
    expect(await prisma.account.count()).toBe(2);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/accounts/import/confirm')
          .set('Cookie', cookie)
          .field('previewHash', '0'.repeat(64))
          .attach('file', valid, 'plan.xlsx')
      ).status,
    ).toBe(409);
  });
  it('conserva vigencias PENDING, ACTIVE y PENDING sin solaparse', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'account_admin' } });
    const account = await prisma.account.create({
      data: { code: '110505', name: 'Caja', type: 'ASSET', level: 1, allowsMovement: true },
    });
    const day = (offset: number) => {
      const date = new Date();
      date.setUTCHours(12, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() + offset);
      return date;
    };
    await repository.transaction((tx) => repository.setMapping('CASH', null, user.id, tx, day(-3)));
    await repository.transaction((tx) =>
      repository.setMapping('CASH', account.id, user.id, tx, day(-2)),
    );
    await repository.transaction((tx) => repository.setMapping('CASH', null, user.id, tx, day(-1)));
    const history = await prisma.companyAccountingMapping.findMany({
      where: { purpose: 'CASH' },
      orderBy: { effectiveFrom: 'asc' },
    });
    expect(history.map((entry) => entry.status)).toEqual([
      'PENDING_MAPPING',
      'ACTIVE',
      'PENDING_MAPPING',
    ]);
    expect(history[0].effectiveTo?.toISOString().slice(0, 10)).toBe(
      day(-3).toISOString().slice(0, 10),
    );
    expect(history[1].effectiveTo?.toISOString().slice(0, 10)).toBe(
      day(-2).toISOString().slice(0, 10),
    );
    expect(history[2].effectiveTo).toBeNull();
    expect(
      (await repository.listMappings(day(-3))).find((entry) => entry.purpose === 'CASH')?.status,
    ).toBe('PENDING_MAPPING');
    expect(
      (await repository.listMappings(day(-2))).find((entry) => entry.purpose === 'CASH')?.status,
    ).toBe('ACTIVE');
    expect((await accounting.resolveAccountByPurpose('CASH', day(-2))).id).toBe(account.id);
    await expect(accounting.resolveAccountByPurpose('CASH', day(-1))).rejects.toThrow('CASH');
  });

  it('rechaza tipos de cuenta incompatibles e identificadores mal formados', async () => {
    const income = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Cookie', cookie)
      .send({ code: '4', name: 'Ingreso', type: 'INCOME', allowsMovement: true });
    expect(income.status).toBe(201);
    const asset = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Cookie', cookie)
      .send({ code: '1', name: 'Caja', type: 'ASSET', allowsMovement: true });
    expect(asset.status).toBe(201);
    expect(
      (
        await request(app.getHttpServer())
          .put('/api/v1/accounting/purposes/CASH')
          .set('Cookie', cookie)
          .send({ accountId: asset.body.id })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/v1/accounts/${asset.body.id}`)
          .set('Cookie', cookie)
          .send({ type: 'INCOME' })
      ).status,
    ).toBe(400);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: asset.body.id } })).type).toBe(
      'ASSET',
    );

    expect(
      (
        await request(app.getHttpServer())
          .put('/api/v1/accounting/purposes/CASH')
          .set('Cookie', cookie)
          .send({ accountId: income.body.id })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .put('/api/v1/accounting/purposes/CASH')
          .set('Cookie', cookie)
          .send({ accountId: '-'.repeat(36) })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .patch(`/api/v1/accounts/${'-'.repeat(36)}`)
          .set('Cookie', cookie)
          .send({ name: 'Invalido' })
      ).status,
    ).toBe(400);
  });

  it('rechaza ZIP con expansión declarada excesiva antes de ExcelJS y bloquea importación sin permiso', async () => {
    const valid = await file([['1', 'Activo', 'ASSET', '', 'NO', 'ACTIVO', '']]);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/accounts/import/preview')
          .set('Cookie', cashierCookie)
          .attach('file', valid, 'plan.xlsx')
      ).status,
    ).toBe(403);
    const oversized = Buffer.from(valid);
    const central = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(central).toBeGreaterThanOrEqual(0);
    oversized.writeUInt32LE(25 * 1024 * 1024, central + 24);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/accounts/import/preview')
          .set('Cookie', cookie)
          .attach('file', oversized, 'plan.xlsx')
      ).status,
    ).toBe(400);
    const duplicate = await file([
      ['1', 'Activo', 'ASSET', '', 'NO', 'ACTIVO', ''],
      ['1', 'Duplicado', 'ASSET', '', 'NO', 'ACTIVO', ''],
    ]);
    const preview = await request(app.getHttpServer())
      .post('/api/v1/accounts/import/preview')
      .set('Cookie', cookie)
      .attach('file', duplicate, 'plan.xlsx');
    expect(preview.body.errorCount).toBe(1);
  });

  it('revierte toda la importación si falla una inserción intermedia', async () => {
    const data = await file([
      ['1', 'Activo', 'ASSET', '', 'NO', 'ACTIVO', ''],
      ['11', 'Disponible', 'ASSET', '1', 'NO', 'ACTIVO', ''],
    ]);
    const preview = await request(app.getHttpServer())
      .post('/api/v1/accounts/import/preview')
      .set('Cookie', cookie)
      .attach('file', data, 'plan.xlsx');
    expect(preview.body.validCount).toBe(2);
    const original = repository.createAccount.bind(repository);
    let calls = 0;
    const spy = vi.spyOn(repository, 'createAccount').mockImplementation(async (...args) => {
      calls++;
      if (calls === 2) throw new Error('Fallo simulado');
      return original(...args);
    });
    try {
      await expect(
        accounting.confirm(
          data,
          preview.body.previewHash,
          (await prisma.user.findUniqueOrThrow({ where: { username: 'account_admin' } })).id,
        ),
      ).rejects.toThrow('Fallo simulado');
    } finally {
      spy.mockRestore();
    }
    expect(await prisma.account.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: 'accounting:account_created' } })).toBe(
      0,
    );
  });

  it('procesa y valida correctamente el archivo PUC enviado por la contadora', async () => {
    const pucPath = path.resolve(__dirname, '../../../../docs/PUC.xlsx');
    if (!fs.existsSync(pucPath)) return;
    const buffer = fs.readFileSync(pucPath);

    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts/import/preview')
      .set('Cookie', cookie)
      .attach('file', buffer, 'PUC.xlsx');

    expect(response.status).toBe(201);
    expect(response.body.validCount).toBe(2939);
    expect(response.body.errorCount).toBe(0);
    expect(response.body.warningCount).toBe(2);

    const bankAccount = response.body.rows.find((r: any) => r.code === '11200501');
    expect(bankAccount).toBeDefined();
    expect(bankAccount.name).toBe('Bancolombia Cta Aho 68095832443');
    expect(bankAccount.type).toBe('ASSET');
    expect(bankAccount.allowsMovement).toBe(true);
    expect(bankAccount.purpose).toBe('BANK');

    const cashAccount = response.body.rows.find((r: any) => r.code === '11050501');
    expect(cashAccount.purpose).toBe('CASH');

    const orderAccount = response.body.rows.find((r: any) => r.code === '8105');
    expect(orderAccount.type).toBe('ORDER_DEBTOR');
  });
});
