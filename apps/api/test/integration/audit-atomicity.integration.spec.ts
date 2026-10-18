import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanTestDatabase, prisma } from '@farmacia/database';
import { AuditService } from '../../src/modules/audit/application/services/audit.service';
import { PrismaAuditEventRepository } from '../../src/modules/audit/infrastructure/adapters/prisma-audit-event.repository';
import { InventoryLotService } from '../../src/modules/inventory/application/services/inventory-lot.service';
import { PrismaInventoryLotRepository } from '../../src/modules/inventory/infrastructure/adapters/prisma-inventory-lot.repository';
import { PrismaProductRepository } from '../../src/modules/catalog/infrastructure/adapters/prisma-product.repository';
import { PurchaseService } from '../../src/modules/purchases/application/purchase.service';
import { PrismaPurchaseRepository } from '../../src/modules/purchases/infrastructure/prisma-purchase.repository';
import type { AccountingEngineService } from '../../src/modules/accounting/application/accounting-engine.service';
import { CategoryService } from '../../src/modules/catalog/application/services/category.service';
import { PrismaCategoryRepository } from '../../src/modules/catalog/infrastructure/adapters/prisma-category.repository';
import { CustomerService } from '../../src/modules/customers/application/customer.service';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { SupplierService } from '../../src/modules/suppliers/application/supplier.service';
import { PrismaSupplierRepository } from '../../src/modules/suppliers/infrastructure/prisma-supplier.repository';
import { ThirdPartyService } from '../../src/modules/third-parties/application/third-party.service';
import { PrismaThirdPartyRepository } from '../../src/modules/third-parties/infrastructure/prisma-third-party.repository';
import { ProductService } from '../../src/modules/catalog/application/services/product.service';
import { ProductPresentationService } from '../../src/modules/catalog/application/services/product-presentation.service';
import { PrismaProductPresentationRepository } from '../../src/modules/catalog/infrastructure/adapters/prisma-product-presentation.repository';

import { AuthService } from '../../src/modules/identity/application/services/auth.service';
import { SessionService } from '../../src/modules/identity/application/services/session.service';
import { PrismaSessionRepository } from '../../src/modules/identity/infrastructure/adapters/prisma-session.repository';
import { CryptoSessionTokenAdapter } from '../../src/modules/identity/infrastructure/adapters/crypto-session-token.adapter';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/adapters/prisma-user.repository';
import { CashService } from '../../src/modules/cash/application/cash.service';
import { PrismaCashMovementRepository } from '../../src/modules/cash/infrastructure/prisma-cash-movement.repository';
import { TreasuryService } from '../../src/modules/treasury/application/treasury.service';

// Se escribe auditoría REAL y se provoca un fallo posterior: ambas escrituras deben revertirse.
describe('Auditoría atómica con PostgreSQL real', () => {
  let productId: string;
  let locationId: string;
  let supplierId: string;
  let categoryId: string;
  let audit: AuditService;

  beforeEach(async () => {
    await cleanTestDatabase();
    categoryId = (await prisma.category.create({ data: { name: 'Atomicidad' } })).id;
    productId = (
      await prisma.product.create({
        data: { categoryId, code: 'ATOMIC', name: 'Producto atómico', basePrice: '10.00' },
      })
    ).id;
    locationId = (
      await prisma.location.create({
        data: { code: 'ATOMIC', name: 'Ubicación atómica', isDefault: true },
      })
    ).id;
    supplierId = (
      await prisma.supplier.create({ data: { taxId: '900001', name: 'Proveedor atómico' } })
    ).id;
    audit = new AuditService(new PrismaAuditEventRepository());
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  function failAfterAudit() {
    const recordEvent = audit.recordEvent.bind(audit);
    return vi.spyOn(audit, 'recordEvent').mockImplementation(async (input, tx) => {
      expect(tx).toBeDefined();
      const event = await recordEvent(input, tx);
      expect(await (tx as typeof prisma).auditEvent.count({ where: { id: event.id } })).toBe(1);
      throw new Error('Fallo inducido después de auditar');
    });
  }

  it('un lote, su kardex y su auditoría revierten ante un fallo después de auditar', async () => {
    const service = new InventoryLotService(
      new PrismaInventoryLotRepository(),
      new PrismaProductRepository(),
      audit,
    );
    const recorded = failAfterAudit();
    await expect(
      service.createLot({
        productId,
        locationId,
        lotNumber: 'LOT-ROLLBACK',
        expirationDate: '2099-01-01',
        initialQuantity: 5,
      }),
    ).rejects.toThrow('Fallo inducido');
    expect(recorded).toHaveBeenCalledOnce();
    expect(await prisma.inventoryLot.count()).toBe(0);
    expect(await prisma.inventoryMovement.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('una compra, su cuenta por pagar y el stock revierten si contabilidad falla después de auditar', async () => {
    const handlePurchaseReceived = vi.fn(async (_input, tx: typeof prisma) => {
      expect(await tx.auditEvent.count({ where: { action: 'purchases:purchase_received' } })).toBe(
        1,
      );
      throw new Error('Fallo contable después de auditar');
    });
    const service = new PurchaseService(new PrismaPurchaseRepository(), audit, prisma, {
      handlePurchaseReceived,
    } as unknown as AccountingEngineService);
    await expect(
      service.receivePurchase({
        supplierId,
        invoiceNumber: 'ATOMIC-ROLLBACK',
        purchaseDate: '2026-10-01',
        lines: [
          {
            productId,
            lotNumber: 'PURCHASE-ROLLBACK',
            expirationDate: '2099-01-01',
            quantityCommercial: 5,
            unitCost: 10,
          },
        ],
      }),
    ).rejects.toThrow('Fallo contable');
    expect(handlePurchaseReceived).toHaveBeenCalledOnce();
    expect(await prisma.purchase.count()).toBe(0);
    expect(await prisma.purchaseLine.count()).toBe(0);
    expect(await prisma.payable.count()).toBe(0);
    expect(await prisma.inventoryLot.count()).toBe(0);
    expect(await prisma.inventoryMovement.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('una auditoría que no puede persistirse impide confirmar la compra', async () => {
    vi.spyOn(audit, 'recordEvent').mockRejectedValue(new Error('Auditoría indisponible'));
    const service = new PurchaseService(new PrismaPurchaseRepository(), audit);
    await expect(
      service.receivePurchase({
        supplierId,
        invoiceNumber: 'AUDIT-FAIL',
        purchaseDate: '2026-10-01',
        lines: [
          {
            productId,
            lotNumber: 'AUDIT-FAIL',
            expirationDate: '2099-01-01',
            quantityCommercial: 1,
            unitCost: 10,
          },
        ],
      }),
    ).rejects.toThrow('Auditoría indisponible');
    expect(await prisma.purchase.count()).toBe(0);
    expect(await prisma.payable.count()).toBe(0);
    expect(await prisma.inventoryLot.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it.each([
    'categoría',
    'producto',
    'presentación',
    'cliente',
    'proveedor',
    'tercero',
    'ubicación',
  ] as const)('%s y auditoría revierten juntos', async (entity) => {
    const recorded = failAfterAudit();
    const categories = new PrismaCategoryRepository();
    const products = new PrismaProductRepository();
    const thirdParties = new ThirdPartyService(new PrismaThirdPartyRepository(), audit);
    const operation = {
      categoría: () =>
        new CategoryService(categories, audit).createCategory({ name: 'Nueva categoría' }),
      producto: () =>
        new ProductService(products, categories, audit).createProduct({
          categoryId,
          code: 'NEW',
          name: 'Nuevo producto',
          basePrice: 1,
        }),
      presentación: () =>
        new ProductPresentationService(
          new PrismaProductPresentationRepository(),
          products,
          audit,
        ).createPresentation(productId, { name: 'Caja', quantityContained: 1, price: 1 }),
      cliente: () =>
        new CustomerService(new PrismaCustomerRepository(), audit, thirdParties).createCustomer({
          documentNumber: 'NEW-CUSTOMER',
          name: 'Cliente nuevo',
        }),
      proveedor: () =>
        new SupplierService(new PrismaSupplierRepository(), audit, thirdParties).createSupplier({
          taxId: 'NEW-SUPPLIER',
          name: 'Proveedor nuevo',
        }),
      tercero: () =>
        thirdParties.createThirdParty({
          documentNumber: 'NEW-THIRD',
          name: 'Tercero nuevo',
          isCustomer: true,
          isSupplier: true,
        }),
      ubicación: () =>
        new InventoryLotService(new PrismaInventoryLotRepository(), products, audit).createLocation(
          { code: 'NEW', name: 'Nueva ubicación' },
        ),
    }[entity];
    await expect(operation()).rejects.toThrow('Fallo inducido');
    expect(recorded).toHaveBeenCalledOnce();
    expect(await prisma.category.count()).toBe(1);
    expect(await prisma.product.count()).toBe(1);
    expect(await prisma.productPresentation.count()).toBe(0);
    expect(await prisma.customer.count({ where: { documentNumber: 'NEW-CUSTOMER' } })).toBe(0);
    expect(await prisma.supplier.count()).toBe(1);
    expect(await prisma.thirdParty.count()).toBe(0);
    expect(await prisma.location.count()).toBe(1);
    expect(await prisma.auditEvent.count()).toBe(0);
  });
  it('crear y revocar una sesión revierten cuando falla su auditoría', async () => {
    const user = await prisma.user.create({
      data: { username: 'atomic_user', passwordHash: 'hash' },
    });
    const sessions = new SessionService(
      new CryptoSessionTokenAdapter(),
      new PrismaSessionRepository(),
    );
    const auth = new AuthService(
      new PrismaUserRepository(),
      { verify: vi.fn().mockResolvedValue(true) } as never,
      sessions,
      { getUserRbacContext: vi.fn().mockResolvedValue({ roles: [], permissions: [] }) } as never,
    );
    failAfterAudit();
    await expect(
      auth.login(user.username, 'password', async (_result, tx) => {
        await audit.recordEvent(
          { action: 'auth:login_success', entity: 'User', entityId: user.id, userId: user.id },
          tx,
        );
      }),
    ).rejects.toThrow('Fallo inducido');
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);

    const { session, rawToken } = await sessions.createSession(user.id);
    await expect(
      auth.logout(rawToken, async (tx) => {
        await audit.recordEvent(
          { action: 'auth:logout', entity: 'Session', entityId: session.id, userId: user.id },
          tx,
        );
      }),
    ).rejects.toThrow('Fallo inducido');
    expect(
      (await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt,
    ).toBeNull();
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('el movimiento manual de caja revierte junto con auditoría', async () => {
    const user = await prisma.user.create({
      data: { username: 'atomic_cash', passwordHash: 'hash' },
    });
    failAfterAudit();
    await expect(
      new CashService(new PrismaCashMovementRepository(), audit).registerMovement(
        {
          movementType: 'INGRESO_MANUAL',
          amount: 10,
          reason: 'Apertura',
          paymentMethod: 'EFECTIVO',
        },
        { userId: user.id },
      ),
    ).rejects.toThrow('Fallo inducido');
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('actualizar una cuenta bancaria revierte si no se puede guardar la auditoría', async () => {
    const user = await prisma.user.create({
      data: { username: 'atomic_bank', passwordHash: 'hash' },
    });
    const bank = await prisma.bankAccount.create({
      data: {
        name: 'Original',
        bankName: 'Banco',
        accountType: 'AHORROS',
        accountNumber: '1234',
        createdById: user.id,
      },
    });
    await expect(
      new TreasuryService().updateAccount(bank.id, { name: 'Modificada' }, crypto.randomUUID()),
    ).rejects.toThrow();
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bank.id } })).name).toBe(
      'Original',
    );
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('la auditoría fallida revierte los factores propagados y las presentaciones predeterminadas', async () => {
    const parent = await prisma.productPresentation.create({
      data: {
        productId,
        name: 'Blíster',
        quantityContained: 5,
        conversionFactor: 5,
        price: 5,
        isDefault: false,
      },
    });
    const child = await prisma.productPresentation.create({
      data: {
        productId,
        name: 'Caja',
        containedPresentationId: parent.id,
        quantityContained: 2,
        conversionFactor: 10,
        price: 10,
        isDefault: true,
      },
    });
    const service = new ProductPresentationService(
      new PrismaProductPresentationRepository(),
      new PrismaProductRepository(),
      audit,
    );
    failAfterAudit();
    await expect(
      service.updatePresentation(productId, parent.id, { quantityContained: 6, isDefault: true }),
    ).rejects.toThrow('Fallo inducido');
    const savedParent = await prisma.productPresentation.findUniqueOrThrow({
      where: { id: parent.id },
    });
    const savedChild = await prisma.productPresentation.findUniqueOrThrow({
      where: { id: child.id },
    });
    expect(savedParent.conversionFactor).toBe(5);
    expect(savedParent.isDefault).toBe(false);
    expect(savedChild.conversionFactor).toBe(10);
    expect(savedChild.isDefault).toBe(true);
    expect(await prisma.auditEvent.count()).toBe(0);
  });
});
