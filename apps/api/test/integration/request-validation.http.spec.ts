import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { cleanTestDatabase, prisma, seedRbac } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { UserProvisioningService } from '../../src/modules/identity/application/services/user-provisioning.service';
import { SESSION_COOKIE_NAME } from '../../src/modules/identity/presentation/utils/session-cookie.util';

type InvalidRequest = {
  controller: string;
  method: 'GET' | 'POST';
  path: string;
  case: string;
  body?: Record<string, unknown>;
};

// Cada caso usa una ruta real y un administrador autenticado: el 400 debe venir
// de la validación de entrada, no de un guard ni de un recurso inexistente.
const invalidRequests: InvalidRequest[] = [
  {
    controller: 'AccountsController',
    method: 'POST',
    path: '/accounts',
    case: 'body inválido',
    body: { code: 42 },
  },
  {
    controller: 'AnnualClosingController',
    method: 'GET',
    path: '/accounting/annual-closings/preview?year=NaN',
    case: 'año inválido',
  },
  {
    controller: 'DocumentLockController',
    method: 'POST',
    path: '/accounting/document-lock',
    case: 'body inválido',
    body: { lockedThrough: 'ayer', reason: 1 },
  },
  {
    controller: 'FiscalPeriodsController',
    method: 'GET',
    path: '/accounting/periods/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'JournalController',
    method: 'GET',
    path: '/journal-entries/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'ManualNotesController',
    method: 'POST',
    path: '/accounting/manual-notes',
    case: 'body inválido',
    body: { entryDate: 'ayer', description: 1, lines: [] },
  },
  {
    controller: 'ProductTaxProfileController',
    method: 'GET',
    path: '/accounting/tax-profiles?productId=no-es-uuid',
    case: 'UUID de query inválido',
  },
  {
    controller: 'AccountingReportsController',
    method: 'GET',
    path: '/accounting/reports/trial-balance?fromDate=ayer&toDate=2026-01-31',
    case: 'fecha inválida',
  },
  {
    controller: 'AlertsController',
    method: 'GET',
    path: '/alerts/jobs?limit=NaN',
    case: 'limit NaN',
  },
  {
    controller: 'AuditController',
    method: 'GET',
    path: '/audit/events/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'BackupsController',
    method: 'POST',
    path: '/backups/archivo.txt/verify',
    case: 'archivo inválido',
  },
  {
    controller: 'CashController',
    method: 'GET',
    path: '/cash-movements/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'CategoryController',
    method: 'GET',
    path: '/categories/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'ProductPresentationController',
    method: 'GET',
    path: '/products/no-es-uuid/presentations',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'ProductController',
    method: 'GET',
    path: '/products/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'UnitOfMeasureController',
    method: 'GET',
    path: '/units-of-measure/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'CustomerController',
    method: 'GET',
    path: '/customers/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'ExpenseCategoriesController',
    method: 'GET',
    path: '/expense-categories/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'ExpensesController',
    method: 'GET',
    path: '/expenses/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'UsersController',
    method: 'POST',
    path: '/users',
    case: 'body inválido',
    body: { username: 4 },
  },
  {
    controller: 'InventoryLotController',
    method: 'GET',
    path: '/inventory/lots/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'InventoryMovementController',
    method: 'GET',
    path: '/inventory/movements?productId=no-es-uuid',
    case: 'UUID de query inválido',
  },
  {
    controller: 'PayablesController',
    method: 'GET',
    path: '/payables/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'DebitNotesController',
    method: 'GET',
    path: '/purchases/no-es-uuid/debit-notes',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'PurchaseController',
    method: 'GET',
    path: '/purchases/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'ReceivablesController',
    method: 'GET',
    path: '/receivables/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'ReportsController',
    method: 'GET',
    path: '/reports/sales?fromDate=ayer',
    case: 'fecha inválida',
  },
  {
    controller: 'CreditNotesController',
    method: 'GET',
    path: '/sales/no-es-uuid/credit-notes',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'SaleController',
    method: 'POST',
    path: '/sales/confirm',
    case: 'body inválido',
    body: { items: 'incorrecto' },
  },
  {
    controller: 'SupplierController',
    method: 'GET',
    path: '/suppliers/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'ThirdPartyController',
    method: 'GET',
    path: '/third-parties/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'TreasuryDocumentsController',
    method: 'GET',
    path: '/treasury/documents/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
  {
    controller: 'TreasuryController',
    method: 'GET',
    path: '/treasury/bank-accounts/no-es-uuid',
    case: 'UUID de ruta inválido',
  },
];

describe('Validación HTTP de runtime con sesión y permisos', () => {
  let app: INestApplication;
  let adminCookie: string;

  beforeAll(async () => {
    await cleanTestDatabase();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    await seedRbac(prisma);
    const provisioningService = moduleFixture.get(UserProvisioningService);
    const authService = moduleFixture.get(AuthService);
    const admin = await provisioningService.provisionInitialUser({
      username: 'admin_request_validation',
      password: 'AdminPassword123!',
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
    await prisma.userRole.create({ data: { userId: admin.id!, roleId: adminRole.id } });
    const login = await authService.login('admin_request_validation', 'AdminPassword123!');
    adminCookie = `${SESSION_COOKIE_NAME}=${login.rawToken}`;
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it.each(invalidRequests)(
    '$controller $method $path: $case → 400',
    async ({ method, path, body }) => {
      const url = `/api/v1${path}`;
      const response =
        method === 'POST'
          ? await request(app.getHttpServer())
              .post(url)
              .set('Cookie', adminCookie)
              .send(body ?? {})
          : await request(app.getHttpServer()).get(url).set('Cookie', adminCookie);
      expect(response.status, JSON.stringify(response.body)).toBe(400);
    },
  );

  it.each([
    ['/sales?page=NaN', 'page NaN'],
    ['/sales?page=-1', 'page negativo'],
    ['/alerts/jobs?limit=NaN', 'limit NaN'],
    ['/alerts/jobs?limit=-1', 'limit negativo'],
    ['/alerts/jobs?limit=101', 'limit mayor que 100'],
  ])('GET %s rechaza %s', async (path) => {
    await request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', adminCookie).expect(400);
  });

  it('GET /sales acepta fechas ISO completas usadas por el historial', async () => {
    const fromDate = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const toDate = new Date('2026-01-31T23:59:59.000Z').toISOString();
    await request(app.getHttpServer())
      .get('/api/v1/sales')
      .query({ fromDate, toDate })
      .set('Cookie', adminCookie)
      .expect(200);
  });
});
