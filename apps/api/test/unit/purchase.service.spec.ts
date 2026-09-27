import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PurchaseService } from '../../src/modules/purchases/application/purchase.service';
import { IPurchaseRepository } from '../../src/modules/purchases/domain/purchase.repository';
import { Purchase, PurchaseLine } from '../../src/modules/purchases/domain/purchase.entity';
import {
  SupplierNotActiveException,
  ExpiredLotDateException,
} from '../../src/modules/purchases/domain/purchase.exceptions';

describe('PurchaseService & Purchase Entities (Unit)', () => {
  let repository: IPurchaseRepository;
  let mockPrisma: any;
  let service: PurchaseService;

  const validFutureDate = new Date();
  validFutureDate.setFullYear(validFutureDate.getFullYear() + 2);

  beforeEach(() => {
    repository = {
      saveTransactional: vi.fn(async (purchase: Purchase) => purchase),
      findById: vi.fn(async () => null),
      findAll: vi.fn(async () => ({ items: [], total: 0 })),
    };

    mockPrisma = {
      supplier: {
        findUnique: vi.fn(async () => ({
          id: 'sup-1',
          name: 'Laboratorios Baxter',
          taxId: '900123456-1',
          isActive: true,
        })),
      },
      location: {
        findFirst: vi.fn(async () => ({
          id: 'loc-1',
          code: 'BOD-01',
          name: 'Bodega Principal',
          isDefault: true,
          isActive: true,
        })),
      },
      product: {
        findUnique: vi.fn(async () => ({
          id: 'prod-1',
          name: 'Acetaminofén 500mg',
          isActive: true,
        })),
      },
      productPresentation: {
        findUnique: vi.fn(async () => ({
          id: 'pres-caja',
          productId: 'prod-1',
          name: 'Caja x 100',
          conversionFactor: 100,
        })),
      },
    };

    service = new PurchaseService(repository, undefined, mockPrisma);
  });

  describe('Entidades de Dominio Purchase y PurchaseLine', () => {
    it('debe crear una PurchaseLine con cálculo exacto de unidades base y subtotal', () => {
      const line = PurchaseLine.create({
        productId: 'prod-1',
        productName: 'Acetaminofén 500mg',
        presentationId: 'pres-caja',
        presentationName: 'Caja x 100',
        lotNumber: 'LOTE-2026-X',
        expirationDate: validFutureDate,
        quantityCommercial: 10,
        conversionFactor: 100,
        unitCost: 15000,
      });

      expect(line.productId).toBe('prod-1');
      expect(line.quantityCommercial).toBe(10);
      expect(line.quantityBaseUnits).toBe(1000); // 10 * 100
      expect(line.unitCost).toBe(15000);
      expect(line.subtotal).toBe(150000); // 10 * 15000
    });

    it('debe rechazar una fecha de vencimiento que ya expiró o es hoy', () => {
      const pastDate = new Date('2020-01-01');

      expect(() =>
        PurchaseLine.create({
          productId: 'prod-1',
          lotNumber: 'LOTE-VIEJO',
          expirationDate: pastDate,
          quantityCommercial: 1,
          conversionFactor: 1,
          unitCost: 1000,
        })
      ).toThrow('no puede ser anterior ni igual a hoy');
    });

    it('debe calcular el total de la compra como la suma exacta de sus líneas', () => {
      const line1 = PurchaseLine.create({
        productId: 'prod-1',
        lotNumber: 'L-1',
        expirationDate: validFutureDate,
        quantityCommercial: 5,
        conversionFactor: 1,
        unitCost: 2000,
      });

      const line2 = PurchaseLine.create({
        productId: 'prod-1',
        lotNumber: 'L-2',
        expirationDate: validFutureDate,
        quantityCommercial: 10,
        conversionFactor: 1,
        unitCost: 1500,
      });

      const purchase = Purchase.create({
        supplierId: 'sup-1',
        invoiceNumber: 'FAC-999',
        purchaseDate: new Date('2026-09-26'),
        lines: [line1, line2],
      });

      expect(purchase.totalAmount).toBe(25000); // 10000 + 15000
      expect(purchase.lines).toHaveLength(2);
    });
  });

  describe('Caso de Uso ReceivePurchase', () => {
    it('debe registrar y recibir una compra exitosamente', async () => {
      const result = await service.receivePurchase({
        supplierId: 'sup-1',
        invoiceNumber: 'FAC-1234',
        purchaseDate: '2026-09-26',
        lines: [
          {
            productId: 'prod-1',
            presentationId: 'pres-caja',
            lotNumber: 'LOTE-ABC-1',
            expirationDate: validFutureDate.toISOString().split('T')[0],
            quantityCommercial: 5,
            unitCost: 20000,
          },
        ],
      });

      expect(result.invoiceNumber).toBe('FAC-1234');
      expect(result.totalAmount).toBe(100000);
      expect(repository.saveTransactional).toHaveBeenCalledTimes(1);
    });

    it('debe lanzar SupplierNotActiveException si el proveedor está inactivo', async () => {
      mockPrisma.supplier.findUnique.mockResolvedValueOnce({
        id: 'sup-inactivo',
        name: 'Proveedor Inactivo',
        isActive: false,
      });

      await expect(
        service.receivePurchase({
          supplierId: 'sup-inactivo',
          invoiceNumber: 'FAC-000',
          purchaseDate: '2026-09-26',
          lines: [
            {
              productId: 'prod-1',
              lotNumber: 'L-1',
              expirationDate: validFutureDate.toISOString().split('T')[0],
              quantityCommercial: 1,
              unitCost: 500,
            },
          ],
        })
      ).rejects.toThrow(SupplierNotActiveException);
    });

    it('debe lanzar ExpiredLotDateException si el lote recibido está vencido', async () => {
      await expect(
        service.receivePurchase({
          supplierId: 'sup-1',
          invoiceNumber: 'FAC-001',
          purchaseDate: '2026-09-26',
          lines: [
            {
              productId: 'prod-1',
              lotNumber: 'LOTE-EXPIRADO',
              expirationDate: '2021-05-15',
              quantityCommercial: 10,
              unitCost: 1000,
            },
          ],
        })
      ).rejects.toThrow(ExpiredLotDateException);
    });
  });
});
