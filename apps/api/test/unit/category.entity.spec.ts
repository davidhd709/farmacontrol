import { describe, it, expect } from 'vitest';
import { Category } from '../../src/modules/catalog/domain/entities/category.entity';

describe('Category Entity (Unit)', () => {
  it('debe crear una categoría válida con valores por defecto', () => {
    const category = Category.create({
      name: 'Medicamentos Generales',
      description: 'Categoría principal de medicamentos',
    });

    expect(category.id).toBeDefined();
    expect(category.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(category.name).toBe('Medicamentos Generales');
    expect(category.description).toBe('Categoría principal de medicamentos');
    expect(category.isActive).toBe(true);
    expect(category.createdAt).toBeInstanceOf(Date);
    expect(category.updatedAt).toBeInstanceOf(Date);
  });

  it('debe rechazar nombres vacíos o menores a 2 caracteres', () => {
    expect(() => Category.create({ name: '' })).toThrow(
      'El nombre de la categoría no puede estar vacío.'
    );
    expect(() => Category.create({ name: '   ' })).toThrow(
      'El nombre de la categoría no puede estar vacío.'
    );
    expect(() => Category.create({ name: 'A' })).toThrow(
      'El nombre de la categoría debe tener al menos 2 caracteres.'
    );
  });

  it('debe rechazar nombres que excedan 100 caracteres', () => {
    expect(() => Category.create({ name: 'a'.repeat(101) })).toThrow(
      'El nombre de la categoría no puede exceder 100 caracteres.'
    );
  });

  it('debe rechazar descripciones que excedan 255 caracteres', () => {
    expect(() =>
      Category.create({
        name: 'Válido',
        description: 'd'.repeat(256),
      })
    ).toThrow('La descripción de la categoría no puede exceder 255 caracteres.');
  });

  it('debe permitir actualizar nombre y descripción respetando validaciones', () => {
    const category = Category.create({ name: 'Inicial', description: 'Desc' });
    category.update({ name: 'Actualizado', description: 'Nueva Desc' });

    expect(category.name).toBe('Actualizado');
    expect(category.description).toBe('Nueva Desc');
  });

  it('debe activar y desactivar la categoría alternando isActive', () => {
    const category = Category.create({ name: 'Prueba' });
    expect(category.isActive).toBe(true);

    category.deactivate();
    expect(category.isActive).toBe(false);

    category.activate();
    expect(category.isActive).toBe(true);
  });

  it('debe serializar a DTO correctamente', () => {
    const fixedDate = new Date('2026-09-25T15:00:00.000Z');
    const category = Category.reconstitute({
      id: 'cat-uuid-001',
      name: 'Oftalmología',
      description: 'Gotas y productos oculares',
      isActive: true,
      createdAt: fixedDate,
      updatedAt: fixedDate,
    });

    const dto = category.toDto();
    expect(dto).toEqual({
      id: 'cat-uuid-001',
      name: 'Oftalmología',
      description: 'Gotas y productos oculares',
      isActive: true,
      createdAt: '2026-09-25T15:00:00.000Z',
      updatedAt: '2026-09-25T15:00:00.000Z',
    });
  });
});
