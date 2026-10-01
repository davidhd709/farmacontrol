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
  ProductPresentationCrossProductException,
  ProductPresentationCycleException,
  ProductPresentationNameAlreadyExistsException,
  ProductPresentationNotFoundException,
  ProductPresentationSelfReferenceException,
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
      updateAndPropagateFactors: vi.fn((entity) => Promise.resolve(entity)),
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

  it('Caso 1: debe calcular automáticamente factores acumulados en jerarquía (Blíster 10 TAB -> Caja 100 Blísteres = 1000 TAB)', async () => {
    // 1. Blíster contiene 10 unidades base
    const blister = ProductPresentation.create({
      id: 'pres-blister',
      productId: 'prod-123',
      name: 'Blíster',
      containedPresentationId: null,
      quantityContained: 10,
      conversionFactor: 10,
      price: 1500,
      cost: 500,
    });

    vi.mocked(presentationRepository.findById).mockImplementation((id: string) => {
      if (id === 'pres-blister') return Promise.resolve(blister);
      return Promise.resolve(null);
    });
    vi.mocked(presentationRepository.findByProductIdAndName).mockResolvedValue(null);
    vi.mocked(presentationRepository.findByBarcode).mockResolvedValue(null);

    // 2. Caja contiene 100 Blísteres
    const boxResult = await service.createPresentation('prod-123', {
      productId: 'prod-123',
      name: 'Caja',
      containedPresentationId: 'pres-blister',
      quantityContained: 100,
      price: 120000,
      cost: 45000,
    });

    expect(boxResult.quantityContained).toBe(100);
    expect(boxResult.conversionFactor).toBe(1000); // 100 * 10 = 1000 TAB
  });

  it('debe persistir el factor actualizado y propagarlo atómicamente a sus descendientes', async () => {
    const blister = ProductPresentation.create({
      id: 'pres-blister-update',
      productId: 'prod-123',
      name: 'Blíster',
      quantityContained: 10,
      conversionFactor: 10,
      price: 1500,
    });
    vi.mocked(presentationRepository.findById).mockResolvedValue(blister);

    const updated = await service.updatePresentation('prod-123', blister.id, {
      quantityContained: 20,
    });

    expect(updated.conversionFactor).toBe(20);
    expect(presentationRepository.updateAndPropagateFactors).toHaveBeenCalledWith(blister);
    expect(presentationRepository.update).not.toHaveBeenCalled();
  });

  it('Caso 6: debe rechazar ciclos de empaques (Caja -> Blíster -> Caja)', async () => {
    // Caja existente con factor 1000
    const caja = ProductPresentation.create({
      id: 'pres-caja',
      productId: 'prod-123',
      name: 'Caja',
      containedPresentationId: null,
      quantityContained: 1000,
      conversionFactor: 1000,
      price: 120000,
    });

    // Blíster existente que ahora intentará contener a Caja (cuando Caja la contenga)
    const blister = ProductPresentation.create({
      id: 'pres-blister',
      productId: 'prod-123',
      name: 'Blíster',
      containedPresentationId: 'pres-caja', // Blíster ya apunta a Caja
      quantityContained: 10,
      conversionFactor: 10000,
      price: 1500,
    });

    vi.mocked(presentationRepository.findById).mockImplementation((id: string) => {
      if (id === 'pres-caja') return Promise.resolve(caja);
      if (id === 'pres-blister') return Promise.resolve(blister);
      return Promise.resolve(null);
    });

    // Intentar actualizar Caja para que contenga Blíster -> genera ciclo Caja -> Blíster -> Caja
    await expect(
      service.updatePresentation('prod-123', 'pres-caja', {
        containedPresentationId: 'pres-blister',
        quantityContained: 100,
      }),
    ).rejects.toThrow(ProductPresentationCycleException);
  });

  it('Caso 7: debe rechazar asignación de presentación de otro producto como empaque contenido', async () => {
    // Presentación de otro producto
    const otherProductPres = ProductPresentation.create({
      id: 'pres-other-prod',
      productId: 'prod-other-999',
      name: 'Caja Ajena',
      conversionFactor: 50,
      price: 5000,
    });

    vi.mocked(presentationRepository.findById).mockResolvedValue(otherProductPres);

    await expect(
      service.createPresentation('prod-123', {
        productId: 'prod-123',
        name: 'Paquete Inválido',
        containedPresentationId: 'pres-other-prod',
        quantityContained: 2,
        price: 10000,
      }),
    ).rejects.toThrow(ProductPresentationCrossProductException);
  });

  it('Caso 9: Retail (LAT base -> Six-Pack x6 -> Paca x4 Six-Pack = 24 LAT; 10 Pacas = 240 LAT)', async () => {
    const sixPack = ProductPresentation.create({
      id: 'pres-sixpack',
      productId: 'prod-123',
      name: 'Six-Pack',
      containedPresentationId: null,
      quantityContained: 6,
      conversionFactor: 6,
      price: 18000,
      cost: 12000,
    });

    const paca = ProductPresentation.create({
      id: 'pres-paca',
      productId: 'prod-123',
      name: 'Paca',
      containedPresentationId: 'pres-sixpack',
      quantityContained: 4,
      conversionFactor: 24, // 4 * 6 = 24 LAT
      price: 68000,
      cost: 45000,
    });

    vi.mocked(presentationRepository.findById).mockImplementation((id: string) => {
      if (id === 'pres-sixpack') return Promise.resolve(sixPack);
      if (id === 'pres-paca') return Promise.resolve(paca);
      return Promise.resolve(null);
    });

    // Validar conversión de 10 Pacas a unidades base
    const conversionResult = await service.convertUnits('prod-123', 'pres-paca', 10, 'toBase');
    expect(conversionResult.baseUnits).toBe(240); // 10 * 24 = 240 LAT
  });
});
