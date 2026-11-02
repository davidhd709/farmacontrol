import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { prisma, cleanTestDatabase, seedRbac, Prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import { JournalController } from '../../src/modules/accounting/presentation/journal.controller';
import type { AuthenticatedUserContext } from '../../src/modules/identity/presentation/guards/session-auth.guard';
import { seedPurposeMappings } from './support/accounting-fixtures';

/**
 * Correcciones del cliente (2026-11-02): las fechas de producción se calculan en el día de
 * Bogotá. La base y el servidor pueden correr en UTC; desde las 19:00 de Colombia la fecha
 * UTC ya es la del día siguiente.
 */
describe('Fechas de negocio cerca de la medianoche de Bogotá', () => {
  let app: INestApplication;
  let cookie: string;
  let adminId: string;
  let journal: JournalService;
  let controller: JournalController;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await module
      .get(UserProvisioningService)
      .provisionInitialUser({ username: 'medianoche', password: 'AdminPassword#2026' });
    adminId = admin.id!;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: adminId, roleId: adminRole.id } });
    cookie = `${SESSION_COOKIE_NAME}=${(await module.get(AuthService).login('medianoche', 'AdminPassword#2026')).rawToken}`;
    journal = module.get(JournalService);
    controller = module.get(JournalController);
    await seedPurposeMappings();
  }, 45000);

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const entry = (entryDate: string, sourceId: string, sourceType = 'SALE') =>
    journal.post({
      entryDate,
      description: `Asiento ${sourceId}`,
      sourceType,
      sourceId,
      createdById: adminId,
      lines: [
        { purpose: 'CASH', debit: '1000.00', credit: '0.00' },
        { purpose: 'SALES_EXCLUDED', debit: '0.00', credit: '1000.00' },
      ],
    });

  it('la base calcula el día de Bogotá a las 23:59 y a las 00:00', async () => {
    const rows = await prisma.$queryRaw<Array<{ late: Date; midnight: Date; evening: Date }>>`
      SELECT business_date('2026-11-02T23:59:59-05:00'::timestamptz) AS late,
             business_date('2026-11-03T00:00:00-05:00'::timestamptz) AS midnight,
             business_date('2026-11-03T00:30:00Z'::timestamptz) AS evening
    `;
    expect(rows[0].late.toISOString().slice(0, 10)).toBe('2026-11-02');
    expect(rows[0].midnight.toISOString().slice(0, 10)).toBe('2026-11-03');
    // 19:30 de Bogotá: UTC ya es 3 de noviembre, el negocio sigue en el 2
    expect(rows[0].evening.toISOString().slice(0, 10)).toBe('2026-11-02');
  });

  it('las reglas de fecha de los triggers usan el día de Bogotá, no CURRENT_DATE de la base', async () => {
    const rows = await prisma.$queryRaw<Array<{ name: string; body: string }>>`
      SELECT p.proname AS name, pg_get_functiondef(p.oid) AS body
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('guard_product_tax_profile_history', 'protect_accounting_mapped_account')
    `;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.body, row.name).toContain('business_date()');
      expect(row.body, row.name).not.toMatch(/CURRENT_DATE/i);
    }
  });

  it('a las 23:30 de Bogotá la anulación sin fecha queda en el mismo día, no en el UTC siguiente', async () => {
    const original = await entry('2026-11-01', `midnight-${randomUUID()}`, 'MANUAL_NOTE');
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-02T23:30:00-05:00') });
    const reversed = await controller.annul(
      original.id,
      { reason: 'Reverso de noche' } as never,
      { id: adminId } as AuthenticatedUserContext,
    );
    expect(reversed.entryDate).toBe('2026-11-02');
  });

  it('el filtro "hasta" del Libro Diario incluye el día pedido y no el siguiente', async () => {
    const tag = randomUUID().slice(0, 8);
    const sameDay = await entry('2026-10-20', `hasta-${tag}-a`);
    const nextDay = await entry('2026-10-21', `hasta-${tag}-b`);
    const res = await request(app.getHttpServer())
      .get('/api/v1/journal-entries?fromDate=2026-10-20&toDate=2026-10-20&pageSize=100')
      .set('Cookie', cookie)
      .expect(200);
    const ids = (res.body.items ?? res.body.data ?? []).map((e: { id: string }) => e.id);
    expect(ids).toContain(sameDay.id);
    expect(ids).not.toContain(nextDay.id);
  });

  it('el estado de cuenta del tercero fecha la factura de las 23:30 en el día de Bogotá', async () => {
    const customer = await prisma.customer.create({ data: { documentNumber: `9${Date.now()}`, name: 'Cliente Nocturno' } });
    const thirdParty = await prisma.thirdParty.create({
      data: {
        documentType: 'CC',
        documentNumber: customer.documentNumber,
        name: customer.name,
        isCustomer: true,
        customerId: customer.id,
      },
    });
    // Venta emitida el 2 de noviembre a las 23:30 de Bogotá (3 de noviembre 04:30 UTC)
    const issuedAt = new Date('2026-11-02T23:30:00-05:00');
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: `FAC-N-${randomUUID().slice(0, 6)}`,
        customerId: customer.id,
        status: 'COMPLETED',
        paymentMethod: 'CREDITO',
        subtotal: new Prisma.Decimal('1000.00'),
        total: new Prisma.Decimal('1000.00'),
        createdById: adminId,
        createdAt: issuedAt,
      },
    });
    await prisma.receivable.create({
      data: {
        saleId: sale.id,
        customerId: customer.id,
        totalAmount: new Prisma.Decimal('1000.00'),
        balance: new Prisma.Decimal('1000.00'),
        dueDate: new Date('2026-12-02T00:00:00Z'),
        createdAt: issuedAt,
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/third-parties/${thirdParty.id}/statement`)
      .set('Cookie', cookie)
      .expect(200);
    const invoice = res.body.receivables.items.find((i: { invoiceNumber: string | null }) => i.invoiceNumber === sale.invoiceNumber);
    expect(invoice.documentDate).toBe('2026-11-02');
  });
});
