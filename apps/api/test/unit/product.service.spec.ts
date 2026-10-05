import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductService } from '../../src/modules/catalog/application/services/product.service';
import type { ProductRepositoryPort } from '../../src/modules/catalog/application/ports/product.repository.port';
import type { CategoryRepositoryPort } from '../../src/modules/catalog/application/ports/category.repository.port';
import { Product } from '../../src/modules/catalog/domain/entities/product.entity';
import { Category } from '../../src/modules/catalog/domain/entities/category.entity';
import {
  ProductBarcodeAlreadyExistsException,
  ProductCategoryNotFoundException,
  ProductCodeAlreadyExistsException,
  ProductNotFoundException,
} from '../../src/modules/catalog/domain/exceptions/product.exceptions';
import type { AuditService } from '../../src/modules/audit/application/services/audit.service';

describe('ProductService (Application Unit)', () => {
  let productRepository: ProductRepositoryPort;
  let categoryRepository: CategoryRepositoryPort;
  let auditService: AuditService;
  let productService: ProductService;

  const mockCategory = Category.reconstitute({
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Analgésicos',
    description: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const sampleProduct = Product.create({
    id: 'b0000000-0000-0000-0000-000000000001',
    categoryId: mockCategory.id,
    categoryName: mockCategory.name,
    code: 'IBU-400',
    barcode: '7701112223334',
    name: 'Ibuprofeno 400mg',
    basePrice: 1200,
  });

  beforeEach(() => {
    productRepository = {
      findById: vi.fn(async () => null),
      findByCode: vi.fn(async () => null),
      findByBarcode: vi.fn(async () => null),
      save: vi.fn(async (prod: Product) => prod),
      update: vi.fn(async (prod: Product) => prod),
      findAll: vi.fn(async () => ({ items: [], total: 0 })),
    };

    categoryRepository = {
      findById: vi.fn(async (id: string) => (id === mockCategory.id ? mockCategory : null)),
      findByName: vi.fn(async () => null),
      create: vi.fn(async (cat: Category) => cat),
      update: vi.fn(async (cat: Category) => cat),
      findAll: vi.fn(async () => ({ items: [], total: 0 })),
      hasActiveProducts: vi.fn(async () => false),
    };

    auditService = {
      recordEvent: vi.fn(async () => {}),
    } as unknown as AuditService;

    productService = new ProductService(
      productRepository,
      categoryRepository,
      auditService,
    );
  });

  it('debe registrar un nuevo producto y auditar el evento si los datos son válidos', async () => {
    const result = await productService.createProduct(
      {
        categoryId: mockCategory.id,
        code: 'IBU-400',
        barcode: '7701112223334',
        name: 'Ibuprofeno 400mg',
        basePrice: 1200,
      },
      { userId: 'u1', correlationId: 'corr-1' },
    );

    expect(result.code).toBe('IBU-400');
    expect(result.name).toBe('Ibuprofeno 400mg');
    expect(productRepository.save).toHaveBeenCalledTimes(1);
    expect(auditService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'catalog:product_created',
        entity: 'Product',
      }),
    );
  });

  it('debe rechazar la creación si la categoría no existe o está inactiva', async () => {
    await expect(
      productService.createProduct({
        categoryId: 'non-existent-cat',
        code: 'XYZ-123',
        name: 'Producto Huérfano',
        basePrice: 1000,
      }),
    ).rejects.toThrow(ProductCategoryNotFoundException);
  });

  it('debe rechazar la creación si el código interno ya existe', async () => {
    vi.mocked(productRepository.findByCode).mockResolvedValueOnce(sampleProduct);

    await expect(
      productService.createProduct({
        categoryId: mockCategory.id,
        code: 'IBU-400',
        name: 'Ibuprofeno Genérico',
        basePrice: 900,
      }),
    ).rejects.toThrow(ProductCodeAlreadyExistsException);
  });

  it('debe rechazar la creación si el código de barras ya existe', async () => {
    vi.mocked(productRepository.findByBarcode).mockResolvedValueOnce(sampleProduct);

    await expect(
      productService.createProduct({
        categoryId: mockCategory.id,
        code: 'IBU-400-NUEVO',
        barcode: '7701112223334',
        name: 'Ibuprofeno Nueva Marca',
        basePrice: 950,
      }),
    ).rejects.toThrow(ProductBarcodeAlreadyExistsException);
  });

  it('debe obtener un producto por ID o lanzar ProductNotFoundException', async () => {
    vi.mocked(productRepository.findById).mockResolvedValueOnce(sampleProduct);

    const found = await productService.getProductById(sampleProduct.id);
    expect(found.id).toBe(sampleProduct.id);

    await expect(
      productService.getProductById('invalid-id'),
    ).rejects.toThrow(ProductNotFoundException);
  });

  it('debe actualizar los atributos del producto y auditar la modificación', async () => {
    vi.mocked(productRepository.findById).mockResolvedValueOnce(sampleProduct);

    const updated = await productService.updateProduct(
      sampleProduct.id,
      {
        name: 'Ibuprofeno 400mg Capsulas Blandas',
        basePrice: 1600,
      },
      { userId: 'u1' },
    );

    expect(updated.name).toBe('Ibuprofeno 400mg Capsulas Blandas');
    expect(updated.basePrice).toBe('1600.00');
    expect(productRepository.update).toHaveBeenCalledTimes(1);
    expect(auditService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'catalog:product_updated',
      }),
    );
  });

  it('debe desactivar lógicamente un producto', async () => {
    vi.mocked(productRepository.findById).mockResolvedValueOnce(sampleProduct);

    const deactivated = await productService.deactivateProduct(sampleProduct.id, {
      userId: 'u1',
    });

    expect(deactivated.isActive).toBe(false);
    expect(productRepository.update).toHaveBeenCalledTimes(1);
    expect(auditService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'catalog:product_deactivated',
      }),
    );
  });

  it('debe listar productos paginados', async () => {
    vi.mocked(productRepository.findAll).mockResolvedValueOnce({
      items: [sampleProduct],
      total: 1,
    });

    const response = await productService.listProducts({ page: 1, pageSize: 10 });

    expect(response.total).toBe(1);
    expect(response.items.length).toBe(1);
    expect(response.items[0].code).toBe('IBU-400');
    expect(response.totalPages).toBe(1);
  });
});
