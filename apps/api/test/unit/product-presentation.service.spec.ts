import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductPresentationService } from '../../src/modules/catalog/application/services/product-presentation.service';
import type { ProductPresentationRepositoryPort } from '../../src/modules/catalog/application/ports/product-presentation.repository.port';
import type { ProductRepositoryPort } from '../../src/modules/catalog/application/ports/product.repository.port';
import { Product } from '../../src/modules/catalog/domain/entities/product.entity';
import { ProductPresentation } from '../../src/modules/catalog/domain/entities/product-presentation.entity';
import { ProductNotFoundException } from '../../src/modules/catalog/domain/exceptions/product.exceptions';
import {
  CannotDeactivateDefaultPresentationException,
  ProductPresentationBarcodeAlreadyExistsException,
  ProductPresentationNameAlreadyExistsException,
  ProductPresentationNotFoundException,
} from '../../src/modules/catalog/domain/exceptions/product-presentation.exceptions';
import type { AuditService } from '../../src/modules/audit/application/services/audit.service';

describe('ProductPresentationService (Application Unit)', () => {
  let service: ProductPresentationService;
  let presentationRepository: ProductPresentationRepositoryPort;
  let productRepository: ProductRepositoryPort;
  let auditService: AuditService;

  const mockProduct = Product.reconstitute({
    id: 'prod-123',
    categoryId: 'cat-123',
    code: 'ACET-500',
    barcode: '7701234567890',
    name: 'Acetaminofén 500mg',
    genericName: 'Paracetamol',
    concentration: '500 mg',
    sanitaryRegistry: 'INVIMA',
    manufacturer: 'Laboratorios Farmacia',
    description: null,
    requiresLotControl: true,
    prescriptionRequired: false,
    baseUnit: 'TABLETA',
    basePrice: '500.00',
    baseCost: '200.00',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    presentationRepository = {
      findById: vi.fn(),
      findByProductIdAndName: vi.fn(),
      findByBarcode: vi.fn(),
      listByProductId: vi.fn(),
      save: vi.fn((entity) => Promise.resolve(entity)),
      update: vi.fn((entity) => Promise.resolve(entity)),
      unsetDefaultPresentations: vi.fn().mockResolvedValue(undefined),
    };

    productRepository = {
      findById: vi.fn().mockResolvedValue(mockProduct),
      findByCode: vi.fn(),
      findByBarcode: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      findAll: vi.fn(),
    };

    auditService = {
      recordEvent: vi.fn().mockResolvedValue({ id: 'audit-1' } as any),
      findEvents: vi.fn(),
    } as unknown as AuditService;

    service = new ProductPresentationService(
      presentationRepository,
      productRepository,
      auditService,
    );
  });

  it('debe registrar exitosamente una presentación comercial y auditar la operación', async () => {
    vi.mocked(presentationRepository.findByProductIdAndName).mockResolvedValue(null);
    vi.mocked(presentationRepository.findByBarcode).mockResolvedValue(null);

    const result = await service.createPresentation(
      'prod-123',
      {
        productId: 'prod-123',
        name: 'Caja x 30',
        barcode: '7709876543210',
        conversionFactor: 30,
        price: 15000,
        cost: 6000,
        isDefault: true,
      },
      {
        userId: 'admin-1',
        correlationId: 'corr-presentation-1',
      },
    );

    expect(result.id).toBeDefined();
    expect(result.name).toBe('Caja x 30');
    expect(result.conversionFactor).toBe(30);
    expect(result.isDefault).toBe(true);

    expect(presentationRepository.unsetDefaultPresentations).toHaveBeenCalledWith('prod-123');
    expect(presentationRepository.save).toHaveBeenCalledTimes(1);
    expect(auditService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'catalog:presentation_created',
        entity: 'ProductPresentation',
        userId: 'admin-1',
        correlationId: 'corr-presentation-1',
      }),
    );
  });

  it('debe rechazar la creación si el producto no existe', async () => {
    vi.mocked(productRepository.findById).mockResolvedValue(null);

    await expect(
      service.createPresentation('prod-invalido', {
        productId: 'prod-invalido',
        name: 'Caja x 20',
        conversionFactor: 20,
        price: 10000,
      }),
    ).rejects.toThrow(ProductNotFoundException);
  });

  it('debe rechazar la creación si ya existe una presentación con el mismo nombre en el producto', async () => {
    const existing = ProductPresentation.create({
      productId: 'prod-123',
      name: 'Caja x 30',
      conversionFactor: 30,
      price: 15000,
    });
    vi.mocked(presentationRepository.findByProductIdAndName).mockResolvedValue(existing);

    await expect(
      service.createPresentation('prod-123', {
        productId: 'prod-123',
        name: 'Caja x 30',
        conversionFactor: 30,
        price: 15000,
      }),
    ).rejects.toThrow(ProductPresentationNameAlreadyExistsException);
  });

  it('debe rechazar la creación si el código de barras ya pertenece a otra presentación', async () => {
    const other = ProductPresentation.create({
      productId: 'prod-999',
      name: 'Otra Presentación',
      barcode: '7709876543210',
      conversionFactor: 1,
      price: 1000,
    });
    vi.mocked(presentationRepository.findByProductIdAndName).mockResolvedValue(null);
    vi.mocked(presentationRepository.findByBarcode).mockResolvedValue(other);

    await expect(
      service.createPresentation('prod-123', {
        productId: 'prod-123',
        name: 'Blíster x 10',
        barcode: '7709876543210',
        conversionFactor: 10,
        price: 5000,
      }),
    ).rejects.toThrow(ProductPresentationBarcodeAlreadyExistsException);
  });

  it('debe rechazar la inactivación de la presentación predeterminada', async () => {
    const defaultPresentation = ProductPresentation.create({
      id: 'pres-default',
      productId: 'prod-123',
      name: 'Presentación Base',
      conversionFactor: 1,
      price: 500,
      isDefault: true,
    });
    vi.mocked(presentationRepository.findById).mockResolvedValue(defaultPresentation);

    await expect(service.deactivatePresentation('prod-123', 'pres-default')).rejects.toThrow(
      CannotDeactivateDefaultPresentationException,
    );
  });

  it('convertUnits: debe convertir cantidades a unidades base y desde unidades base', async () => {
    const box30 = ProductPresentation.create({
      id: 'pres-box30',
      productId: 'prod-123',
      name: 'Caja x 30',
      conversionFactor: 30,
      price: 15000,
    });
    vi.mocked(presentationRepository.findById).mockResolvedValue(box30);

    // toBase
    const toBaseResult = await service.convertUnits('prod-123', 'pres-box30', 4, 'toBase');
    expect(toBaseResult.baseUnits).toBe(120);

    // fromBase
    const fromBaseResult = await service.convertUnits('prod-123', 'pres-box30', 85, 'fromBase');
    expect(fromBaseResult.wholePresentations).toBe(2);
    expect(fromBaseResult.remainderBaseUnits).toBe(25);
  });
});
