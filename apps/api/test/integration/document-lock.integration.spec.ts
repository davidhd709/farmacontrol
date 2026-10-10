import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';
import { businessToday } from '../../src/common/utils/business-date';

/** Bloqueo de documentos por fecha (acuerdo del 4 de octubre), con PostgreSQL real. */
describe('Bloqueo de documentos por fecha', () => {
  let app: INestApplication;
  let journal: JournalService;
  let provisioning: UserProvisioningService;
  let auth: AuthService;
  let adminCookie: string;
  let cashierCookie: string;
  let caja: string;
  let ventas: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    journal = module.get(JournalService);
    provisioning = module.get(UserProvisioningService);
    auth = module.get(AuthService);
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await provisioning.provisionInitialUser({
      username: 'contadora',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('contadora', 'AdminPassword#2026')).rawToken}`;
    const cashier = await prisma.user.create({
      data: { username: 'cajero_lock', passwordHash: admin.passwordHash },
    });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('cajero_lock', 'AdminPassword#2026')).rawToken}`;

    caja = (
      await prisma.account.create({
        data: { code: '110505', name: 'CAJA GENERAL', type: 'ASSET', level: 1, allowsMovement: true },
      })
    ).id;
    ventas = (
      await prisma.account.create({
        data: { code: '413538', name: 'VENTAS', type: 'INCOME', level: 1, allowsMovement: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const post = (entryDate: string, sourceId: string) =>
    journal.post({
      entryDate,
      description: 'Movimiento de prueba',
      sourceType: 'TEST',
      sourceId,
      lines: [
        { accountId: caja, debit: '1000.00', credit: '0.00' },
        { accountId: ventas, debit: '0.00', credit: '1000.00' },
      ],
    });

  const setLock = (body: object, cookie = adminCookie) =>
    request(app.getHttpServer())
      .post('/api/v1/accounting/document-lock')
      .set('Cookie', cookie)
      .send(body);

  it('impide registrar y reversar asientos con fecha igual o anterior al corte', async () => {
    const julio = await post('2026-07-20', 'antes-del-bloqueo');
    await setLock({ lockedThrough: '2026-07-31', reason: 'Informe a corte de julio revisado' }).expect(201);

    await expect(post('2026-07-31', 'en-el-corte')).rejects.toThrow(/bloqueados hasta el 2026-07-31/);
    await expect(post('2026-07-15', 'antes-del-corte')).rejects.toThrow(/bloqueados/);
    await expect(post('2026-08-01', 'despues-del-corte')).resolves.toBeDefined();

    await expect(
      journal.reverse({ entryId: julio.id, entryDate: '2026-07-31', reason: 'Error' }),
    ).rejects.toThrow(/bloqueados/);
    // La corrección se registra en una fecha abierta
    await expect(
      journal.reverse({ entryId: julio.id, entryDate: '2026-08-02', reason: 'Error' }),
    ).resolves.toBeDefined();
  });

  it('también detiene operaciones de negocio con fecha bloqueada antes de mirar los mapeos', async () => {
    await setLock({ lockedThrough: '2026-07-31', reason: 'Corte de julio' }).expect(201);
    await expect(
      journal.canPostForPurposes(['CASH'], new Date('2026-07-10T15:00:00Z')),
    ).rejects.toThrow(/bloqueados/);
  });

  it('retirar el bloqueo vuelve a permitir la fecha y conserva el historial', async () => {
    await setLock({ lockedThrough: '2026-07-31', reason: 'Corte de julio' }).expect(201);
    await setLock({ lockedThrough: null, reason: 'Se reabre para cruzar anticipos' }).expect(201);
    await expect(post('2026-07-20', 'tras-desbloqueo')).resolves.toBeDefined();

    const status = await request(app.getHttpServer())
      .get('/api/v1/accounting/document-lock')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(status.body.current.lockedThrough).toBeNull();
    expect(status.body.history).toHaveLength(2);
    expect(status.body.history[1].lockedThrough).toBe('2026-07-31');
    expect(status.body.history[0].createdByName).toBe('contadora');
    expect(
      await prisma.auditEvent.count({ where: { action: { startsWith: 'accounting:documents_' } } }),
    ).toBe(2);
  });

  it('valida fecha y motivo, y no deja bloquear hoy ni el futuro', async () => {
    await setLock({ lockedThrough: businessToday(), reason: 'Hoy' }).expect(400);
    await setLock({ lockedThrough: '2099-01-01', reason: 'Futuro' }).expect(400);
    await setLock({ lockedThrough: '2026-07-31', reason: '   ' }).expect(400);
    await setLock({ lockedThrough: '31/07/2026', reason: 'Formato' }).expect(400);
    expect(await prisma.documentLock.count()).toBe(0);
  });

  it('solo quien administra la contabilidad puede cambiar el corte', async () => {
    await setLock({ lockedThrough: '2026-07-31', reason: 'Intento' }, cashierCookie).expect(403);
    expect(await prisma.documentLock.count()).toBe(0);
  });

  it('el historial de bloqueos es inmutable', async () => {
    await setLock({ lockedThrough: '2026-07-31', reason: 'Corte de julio' }).expect(201);
    const lock = await prisma.documentLock.findFirstOrThrow();
    await expect(
      prisma.documentLock.update({ where: { id: lock.id }, data: { reason: 'otro' } }),
    ).rejects.toThrow(/inmutable/);
    await expect(prisma.documentLock.delete({ where: { id: lock.id } })).rejects.toThrow(/inmutable/);
  });
});
