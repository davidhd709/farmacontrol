import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

/** Notas contables manuales con fecha elegida (acuerdo del 4 de octubre), PostgreSQL real. */
describe('Notas contables manuales', () => {
  let app: INestApplication;
  let provisioning: UserProvisioningService;
  let auth: AuthService;
  let adminCookie: string;
  let cashierCookie: string;
  let energia: string;
  let caja: string;
  let agrupadora: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    provisioning = module.get(UserProvisioningService);
    auth = module.get(AuthService);
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await provisioning.provisionInitialUser({ username: 'contadora_nt', password: 'AdminPassword#2026' });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    adminCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('contadora_nt', 'AdminPassword#2026')).rawToken}`;
    const cashier = await prisma.user.create({ data: { username: 'cajero_nt', passwordHash: admin.passwordHash } });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { name: 'cajero' } });
    await prisma.userRole.create({ data: { userId: cashier.id, roleId: cashierRole.id } });
    cashierCookie = `${SESSION_COOKIE_NAME}=${(await auth.login('cajero_nt', 'AdminPassword#2026')).rawToken}`;

    const mk = (code: string, name: string, type: 'ASSET' | 'EXPENSE', allowsMovement = true) =>
      prisma.account.create({ data: { code, name, type, level: 1, allowsMovement } });
    energia = (await mk('513525', 'ENERGIA ELECTRICA', 'EXPENSE')).id;
    caja = (await mk('110505', 'CAJA GENERAL', 'ASSET')).id;
    agrupadora = (await mk('5135', 'SERVICIOS', 'EXPENSE', false)).id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const note = (overrides: Record<string, unknown> = {}) => ({
    entryDate: '2026-07-15',
    description: 'Factura de energía de julio registrada en septiembre',
    lines: [
      { accountId: energia, debit: '185000.00', credit: '0' },
      { accountId: caja, debit: '0', credit: '185000.00' },
    ],
    ...overrides,
  });

  const send = (body: object, key: string | null = randomUUID(), cookie = adminCookie) => {
    const req = request(app.getHttpServer()).post('/api/v1/accounting/manual-notes').set('Cookie', cookie);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };

  it('registra la nota con la fecha elegida, consecutivo y partida doble', async () => {
    const first = await send(note()).expect(201);
    const second = await send(note({ entryDate: '2026-08-02' })).expect(201);
    expect(first.body.noteNumber).toBe('NTC-000001');
    expect(second.body.noteNumber).toBe('NTC-000002');

    const entry = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: first.body.journalEntryId },
      include: { lines: true },
    });
    expect(entry.entryDate.toISOString().slice(0, 10)).toBe('2026-07-15');
    expect(entry.sourceType).toBe('MANUAL_NOTE');
    expect(entry.status).toBe('POSTED');
    expect(entry.description).toMatch(/^NTC-000001 /);
    expect(entry.lines).toHaveLength(2);
    expect(await prisma.auditEvent.count({ where: { action: 'accounting:manual_note_created' } })).toBe(2);
  });

  it('rechaza notas desbalanceadas, cuentas agrupadoras y líneas con ambos lados', async () => {
    await send(note({ lines: [
      { accountId: energia, debit: '100.00', credit: '0' },
      { accountId: caja, debit: '0', credit: '90.00' },
    ] })).expect(400);
    await send(note({ lines: [
      { accountId: agrupadora, debit: '100.00', credit: '0' },
      { accountId: caja, debit: '0', credit: '100.00' },
    ] })).expect(400);
    await send(note({ lines: [
      { accountId: energia, debit: '100.00', credit: '100.00' },
      { accountId: caja, debit: '0', credit: '0' },
    ] })).expect(400);
    await send(note({ description: '  ' })).expect(400);
    await send(note({ entryDate: '15/07/2026' })).expect(400);
    expect(await prisma.journalEntry.count()).toBe(0);
  });

  it('respeta el período cerrado y el bloqueo de documentos', async () => {
    await prisma.fiscalPeriod.create({
      data: {
        year: 2026, month: 6, name: 'Junio 2026', status: 'CLOSED',
        startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30'),
      },
    });
    const closed = await send(note({ entryDate: '2026-06-20' })).expect(400);
    expect(closed.body.message).toMatch(/período cerrado/);

    await request(app.getHttpServer())
      .post('/api/v1/accounting/document-lock')
      .set('Cookie', adminCookie)
      .send({ lockedThrough: '2026-07-31', reason: 'Corte de julio' })
      .expect(201);
    const locked = await send(note({ entryDate: '2026-07-15' })).expect(400);
    expect(locked.body.message).toMatch(/bloqueados/);
    await send(note({ entryDate: '2026-08-01' })).expect(201);
  });

  it('un reintento con la misma clave devuelve la misma nota; otro contenido con la misma clave es conflicto', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([send(note(), key), send(note(), key)]);
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    expect(b.body.journalEntryId).toBe(a.body.journalEntryId);
    await send(note({ description: 'Otra' }), key).expect(409);
    await send(note(), null).expect(400);
    expect(await prisma.journalEntry.count()).toBe(1);
  });

  it('solo quien administra la contabilidad registra notas, y se reversan con el diario', async () => {
    await send(note(), randomUUID(), cashierCookie).expect(403);
    const created = await send(note()).expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/journal-entries/${created.body.journalEntryId}/reverse`)
      .set('Cookie', adminCookie)
      .send({ entryDate: '2026-08-05', reason: 'Valor errado' })
      .expect(201);
    expect(await prisma.journalEntry.count({ where: { reversalOfId: created.body.journalEntryId } })).toBe(1);
  });
});
