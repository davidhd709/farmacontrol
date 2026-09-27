import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryService } from '../../src/modules/catalog/application/services/category.service';
import { CategoryRepositoryPort } from '../../src/modules/catalog/application/ports/category.repository.port';
import { Category } from '../../src/modules/catalog/domain/entities/category.entity';
import {
  CategoryNotFoundException,
  CategoryAlreadyExistsException,
  CategoryHasActiveProductsException,
} from '../../src/modules/catalog/domain/exceptions/category.exceptions';

describe('CategoryService (Unit)', () => {
  let repository: CategoryRepositoryPort;
  let service: CategoryService;

  beforeEach(() => {
    repository = {
      create: vi.fn(async (cat: Category) => cat),
      update: vi.fn(async (cat: Category) => cat),
      findById: vi.fn(async () => null),
      findByName: vi.fn(async () => null),
      findAll: vi.fn(async () => ({ items: [], total: 0 })),
      hasActiveProducts: vi.fn(async () => false),
    };

    service = new CategoryService(repository);
  });

  it('debe crear una categoría si el nombre no existe', async () => {
    const result = await service.createCategory({
      name: 'Cardiología',
      description: 'Medicamentos del corazón',
    });

    expect(result.name).toBe('Cardiología');
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('debe lanzar CategoryAlreadyExistsException si ya existe una categoría con el mismo nombre', async () => {
    vi.mocked(repository.findByName).mockResolvedValueOnce(
      Category.create({ name: 'Cardiología' })
    );

    await expect(
      service.createCategory({ name: 'Cardiología' })
    ).rejects.toThrow(CategoryAlreadyExistsException);
  });

  it('debe actualizar una categoría existente', async () => {
    const existing = Category.create({ name: 'Analgésicos', description: 'Vieja desc' });
    vi.mocked(repository.findById).mockResolvedValueOnce(existing);

    const result = await service.updateCategory(existing.id, {
      description: 'Nueva descripción',
    });

    expect(result.description).toBe('Nueva descripción');
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('debe lanzar CategoryNotFoundException al intentar actualizar una categoría inexistente', async () => {
    await expect(
      service.updateCategory('non-existent-id', { name: 'Otro' })
    ).rejects.toThrow(CategoryNotFoundException);
  });

  it('debe impedir inactivar una categoría que posea productos activos asociados', async () => {
    const existing = Category.create({ name: 'Antibióticos' });
    vi.mocked(repository.findById).mockResolvedValueOnce(existing);
    vi.mocked(repository.hasActiveProducts).mockResolvedValueOnce(true);

    await expect(
      service.deactivateCategory(existing.id)
    ).rejects.toThrow(CategoryHasActiveProductsException);
  });

  it('debe inactivar la categoría si no posee productos activos', async () => {
    const existing = Category.create({ name: 'Dermatología' });
    vi.mocked(repository.findById).mockResolvedValueOnce(existing);
    vi.mocked(repository.hasActiveProducts).mockResolvedValueOnce(false);

    const result = await service.deactivateCategory(existing.id);

    expect(result.isActive).toBe(false);
    expect(repository.update).toHaveBeenCalledTimes(1);
  });
});
