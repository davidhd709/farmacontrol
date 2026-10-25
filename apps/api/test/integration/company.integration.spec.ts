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
import { addCalendarDays, businessToday } from '../../src/common/utils/business-date';

/** F3 (ADR-006): empresa, sucursales y políticas contables versionadas, con PostgreSQL real. */
describe('Empresa y políticas contables (PostgreSQL real)', () => {
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    const provisioning = module.get(UserProvisioningService);
    const auth = module.get(AuthService);
    await cleanTestDatabase();
    await seedRbac(prisma);
    const admin = await provisioning.provisionInitialUser({
      username: 'company_admin',
      password: 'AdminPassword#2026',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    cookie = `${SESSION_COOKIE_NAME}=${(await auth.login('company_admin', 'AdminPassword#2026')).rawToken}`;
  }, 45000);

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "company_accounting_policies", "branches", "companies", "inventory_valuation_movements", "inventory_cost_balances", "debit_note_lines", "debit_notes", "journal_entry_lines", "journal_entries", "company_accounting_mappings", "accounts", "payables", "idempotency_keys", "sale_lot_allocations", "sale_lines", "sales", "cash_movements", "customers", "purchase_lines", "purchases", "suppliers", "inventory_movements", "inventory_lots", "locations", "products", "categories", "audit_events" CASCADE`;
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const api = () => request(app.getHttpServer());
  const setupBody = {
    legalName: 'Droguería La Esperanza S.A.S.',
    tradeName: 'La Esperanza',
    taxId: '900123456',
    taxIdCheckDigit: '8',
    sectorProfile: 'PHARMACY',
    municipalityCode: '05001',
    branch: { code: 'PRINCIPAL', name: 'Sede principal', municipalityCode: '05001' },
  };
  const setup = () => api().post('/api/v1/company/setup').set('Cookie', cookie).send(setupBody);
  const policy = (overrides: Record<string, unknown> = {}) =>
    api()
      .post('/api/v1/company/accounting-policies')
      .set('Cookie', cookie)
      .send({
        effectiveFrom: businessToday(),
        costingMethod: 'WEIGHTED_AVERAGE',
        openingCostSource: 'LAST_PURCHASE_THEN_CATALOG',
        purchaseReturnVariancePurpose: 'COST_OF_SALES',
        bonusUnitsTreatment: 'ZERO_COST_IN_AVERAGE',
        reason: 'Política inicial de la empresa',
        ...overrides,
      });

  it('sin empresa configurada rigen los valores por defecto', async () => {
    const res = await api().get('/api/v1/company').set('Cookie', cookie).expect(200);
    expect(res.body.company).toBeNull();
    expect(res.body.currentPolicy).toMatchObject({
      isDefault: true,
      costingMethod: 'WEIGHTED_AVERAGE',
      openingCostSource: 'LAST_PURCHASE_THEN_CATALOG',
      purchaseReturnVariancePurpose: 'COST_OF_SALES',
    });
    expect(res.body.availableCostingMethods).toEqual(['WEIGHTED_AVERAGE']);
  });

  it('configura la empresa una sola vez, con sucursal principal y auditoría', async () => {
    const res = await setup();
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      taxId: '900123456',
      taxIdCheckDigit: '8',
      sectorProfile: 'PHARMACY',
    });
    expect(res.body.branches).toEqual([
      expect.objectContaining({ code: 'PRINCIPAL', isDefault: true, isActive: true }),
    ]);
    expect(await prisma.auditEvent.count({ where: { action: 'company:setup' } })).toBe(1);

    expect((await setup()).status).toBe(409);
    expect(await prisma.company.count()).toBe(1);
  });

  it('valida NIT, dígito de verificación, perfil y código DANE', async () => {
    const bad = (overrides: Record<string, unknown>) =>
      api()
        .post('/api/v1/company/setup')
        .set('Cookie', cookie)
        .send({ ...setupBody, ...overrides });
    expect((await bad({ taxIdCheckDigit: '7' })).body.message).toMatch(/debería ser 8/);
    expect((await bad({ taxId: '900.123.456' })).status).toBe(400);
    expect((await bad({ sectorProfile: 'RESTAURANT' })).body.message).toMatch(/Perfil sectorial/);
    expect((await bad({ municipalityCode: '5001' })).body.message).toMatch(/5 dígitos/);
    expect((await bad({ legalName: '  ' })).body.message).toMatch(/razón social/);
    expect(await prisma.company.count()).toBe(0);
  });

  it('la base de datos impide una segunda empresa activa en modo dedicado', async () => {
    await setup().expect(201);
    await expect(
      prisma.company.create({
        data: {
          legalName: 'Otra empresa',
          taxId: '800197268',
          taxIdCheckDigit: '4',
          sectorProfile: 'PHARMACY',
        },
      }),
    ).rejects.toThrow();
  });

  it('actualiza los datos de la empresa y crea sucursales con código único', async () => {
    await api()
      .patch('/api/v1/company')
      .set('Cookie', cookie)
      .send({ phone: '6045551234' })
      .expect(404);
    await setup().expect(201);
    const updated = await api()
      .patch('/api/v1/company')
      .set('Cookie', cookie)
      .send({ tradeName: 'Esperanza Centro', phone: '6045551234' })
      .expect(200);
    expect(updated.body).toMatchObject({ tradeName: 'Esperanza Centro', phone: '6045551234' });

    const branch = () =>
      api()
        .post('/api/v1/company/branches')
        .set('Cookie', cookie)
        .send({ code: 'NORTE', name: 'Sede norte' });
    expect((await branch()).status).toBe(201);
    expect((await branch()).status).toBe(409);
    const settings = await api().get('/api/v1/company').set('Cookie', cookie).expect(200);
    expect(settings.body.company.branches.map((b: { code: string }) => b.code)).toEqual([
      'NORTE',
      'PRINCIPAL',
    ]);
  });

  it('versiona las políticas: vigencia desde hoy o después, sin editar el pasado', async () => {
    await setup().expect(201);
    const yesterday = addCalendarDays(businessToday(), -1);
    expect((await policy({ effectiveFrom: yesterday })).body.message).toMatch(
      /no puede empezar antes de hoy/,
    );
    expect((await policy({ costingMethod: 'FIFO' })).body.message).toMatch(
      /todavía no está disponible/,
    );
    expect((await policy({ reason: ' ' })).status).toBe(400);

    const current = await policy({ openingCostSource: 'CATALOG' });
    expect(current.status, JSON.stringify(current.body)).toBe(201);
    expect((await policy()).status).toBe(409);
    const future = await policy({
      effectiveFrom: addCalendarDays(businessToday(), 10),
      purchaseReturnVariancePurpose: 'INVENTORY_COST_VARIANCE',
      reason: 'Cuenta propia para diferencias desde el próximo período',
    });
    expect(future.status).toBe(201);

    const settings = await api().get('/api/v1/company').set('Cookie', cookie).expect(200);
    // La versión futura no rige todavía
    expect(settings.body.currentPolicy).toMatchObject({
      id: current.body.id,
      openingCostSource: 'CATALOG',
      purchaseReturnVariancePurpose: 'COST_OF_SALES',
      isDefault: false,
    });
    expect(settings.body.policyHistory).toHaveLength(2);
    await expect(
      prisma.$executeRaw`UPDATE company_accounting_policies SET reason = 'x' WHERE id = ${current.body.id}::uuid`,
    ).rejects.toThrow(/inmutable/);
  });

  describe('las políticas gobiernan el submayor y las notas débito', () => {
    let supplierId: string;
    let productId: string;
    let locationId: string;

    async function mapPurposes(purposes: Array<[string, string, string]>) {
      for (const [purpose, code, type] of purposes) {
        const account = await prisma.account.create({
          data: { code, name: purpose, type: type as any, level: 1, allowsMovement: true },
        });
        await prisma.companyAccountingMapping.create({
          data: {
            purpose: purpose as any,
            accountId: account.id,
            status: 'ACTIVE',
            effectiveFrom: new Date('2020-01-01T00:00:00Z'),
          },
        });
      }
    }

    beforeEach(async () => {
      await setup().expect(201);
      await mapPurposes([
        ['CASH', '110505', 'ASSET'],
        ['INVENTORY', '143501', 'ASSET'],
        ['SUPPLIERS', '220505', 'LIABILITY'],
        ['SALES_EXCLUDED', '413502', 'INCOME'],
        ['COST_OF_SALES', '613501', 'COST'],
      ]);
      supplierId = (
        await prisma.supplier.create({ data: { taxId: '900111222', name: 'Mayorista' } })
      ).id;
      const category = await prisma.category.create({ data: { name: 'General' } });
      productId = (
        await prisma.product.create({
          data: {
            inventoryControlMode: 'LOT_EXPIRY',
            categoryId: category.id,
            code: 'P-1',
            name: 'Producto',
            basePrice: 5000,
            baseCost: 900,
          },
        })
      ).id;
      locationId = (
        await prisma.location.create({ data: { code: 'BOD', name: 'Bodega', isDefault: true } })
      ).id;
      await prisma.customer.create({
        data: {
          documentType: 'CC',
          documentNumber: '222222222222',
          name: 'Consumidor Final',
          isDefault: true,
        },
      });
    });

    it('con apertura al costo del catálogo ignora el último costo de compra', async () => {
      await policy({ openingCostSource: 'CATALOG' }).expect(201);
      // Existencias y compra registradas antes del submayor
      const purchase = await prisma.purchase.create({
        data: {
          supplierId,
          invoiceNumber: 'ANT-1',
          purchaseDate: new Date('2026-01-10T00:00:00Z'),
          totalAmount: 7500,
        },
      });
      const lot = await prisma.inventoryLot.create({
        data: {
          controlMode: 'LOT_EXPIRY',
          productId,
          locationId,
          lotNumber: 'L-ANT',
          expirationDate: new Date('2099-01-01T00:00:00Z'),
          currentQuantity: 5,
        },
      });
      await prisma.purchaseLine.create({
        data: {
          purchaseId: purchase.id,
          productId,
          lotId: lot.id,
          quantityCommercial: 5,
          quantityBaseUnits: 5,
          unitCost: 1500,
          subtotal: 7500,
          lotNumber: 'L-ANT',
          expirationDate: new Date('2099-01-01T00:00:00Z'),
        },
      });

      const sale = await api()
        .post('/api/v1/sales/confirm')
        .set('Cookie', cookie)
        .set('Idempotency-Key', randomUUID())
        .send({ paymentMethod: 'EFECTIVO', items: [{ productId, quantityCommercial: 1 }] });
      expect(sale.status, JSON.stringify(sale.body)).toBe(201);
      const opening = await prisma.inventoryValuationMovement.findFirstOrThrow({
        where: { movementType: 'OPENING' },
      });
      expect(opening.value.toFixed(2)).toBe('4500.00'); // 5 × 900, no 5 × 1500
    });

    it('la diferencia de la nota débito va al propósito que elige la empresa', async () => {
      await policy({ purchaseReturnVariancePurpose: 'INVENTORY_COST_VARIANCE' }).expect(201);
      const receive = (invoiceNumber: string, unitCost: number) =>
        api()
          .post('/api/v1/purchases/receive')
          .set('Cookie', cookie)
          .send({
            supplierId,
            invoiceNumber,
            purchaseDate: businessToday(),
            lines: [
              {
                productId,
                lotNumber: invoiceNumber,
                expirationDate: '2099-01-01',
                quantityCommercial: 10,
                unitCost,
                locationId,
              },
            ],
          });
      expect((await receive('F-1', 1000)).status).toBe(201);
      const second = await receive('F-2', 2000);
      expect(second.status).toBe(201);
      const debitNote = () =>
        api()
          .post(`/api/v1/purchases/${second.body.id}/debit-notes`)
          .set('Cookie', cookie)
          .set('Idempotency-Key', randomUUID())
          .send({
            reason: 'Averiado',
            items: [{ purchaseLineId: second.body.lines[0].id, quantityCommercial: 5 }],
          });

      // Sin cuenta para el propósito elegido, la nota se rechaza completa (ADR-004)
      const rejected = await debitNote();
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toMatch(/INVENTORY_COST_VARIANCE/);
      expect(await prisma.debitNote.count()).toBe(0);

      await mapPurposes([['INVENTORY_COST_VARIANCE', '613595', 'COST']]);
      const res = await debitNote();
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const lines = await prisma.journalEntryLine.findMany({
        where: { journalEntry: { sourceType: 'DEBIT_NOTE', sourceId: res.body.id } },
      });
      const variance = lines.find((l) => l.purpose === 'INVENTORY_COST_VARIANCE');
      expect(variance?.credit.toFixed(2)).toBe('2500.00');
      expect(lines.some((l) => l.purpose === 'COST_OF_SALES')).toBe(false);
    });
  });
});
