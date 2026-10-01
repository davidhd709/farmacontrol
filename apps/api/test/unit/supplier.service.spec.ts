import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupplierService } from '../../src/modules/suppliers/application/supplier.service';
import { ISupplierRepository } from '../../src/modules/suppliers/domain/supplier.repository';
import { Supplier } from '../../src/modules/suppliers/domain/supplier.entity';
import {
  SupplierNotFoundException,
  SupplierAlreadyExistsException,
  SupplierTaxIdChangeForbiddenException,
} from '../../src/modules/suppliers/domain/supplier.exceptions';

describe('SupplierService & Supplier Entity (Unit)', () => {
  let repository: ISupplierRepository;
  let service: SupplierService;

  beforeEach(() => {
    repository = {
      save: vi.fn(async () => {}),
      findById: vi.fn(async () => null),
      findByTaxId: vi.fn(async () => null),
      findAll: vi.fn(async () => ({ items: [], total: 0 })),
      delete: vi.fn(async () => {}),
    };

    service = new SupplierService(repository);
  });

  describe('Entidad de Dominio Supplier', () => {
    it('debe crear un proveedor válido con datos completos', () => {
      const supplier = Supplier.create({
        taxId: '900987654-1',
        name: 'Distribuidora Médica Nacional',
        contactName: 'Laura Pérez',
        phone: '3101234567',
        email: 'ventas@distrimedica.com',
        address: 'Carrera 15 # 80-20',
      });

      expect(supplier.id).toBeDefined();
      expect(supplier.taxId).toBe('900987654-1');
      expect(supplier.name).toBe('Distribuidora Médica Nacional');
      expect(supplier.contactName).toBe('Laura Pérez');
      expect(supplier.email).toBe('ventas@distrimedica.com');
      expect(supplier.isActive).toBe(true);
    });

    it('debe rechazar NIT/identificación vacío o menor a 3 caracteres', () => {
      expect(() =>
        Supplier.create({
          taxId: '12',
          name: 'Proveedor Test',
        }),
      ).toThrow('El NIT/identificación debe tener entre 3 y 50 caracteres');
    });

    it('debe rechazar razón social vacía', () => {
      expect(() =>
        Supplier.create({
          taxId: '900123456',
          name: '  ',
        }),
      ).toThrow('La razón social o nombre del proveedor es obligatorio');
    });

    it('debe rechazar formato de correo electrónico inválido', () => {
      expect(() =>
        Supplier.create({
          taxId: '900123456',
          name: 'Proveedor Test',
          email: 'correo-invalido-sin-arroba',
        }),
      ).toThrow('El correo electrónico ingresado no tiene un formato válido');
    });

    it('permite inactivar y reactivar al proveedor', () => {
      const supplier = Supplier.create({
        taxId: '900123456',
        name: 'Proveedor Test',
      });

      expect(supplier.isActive).toBe(true);
      supplier.deactivate();
      expect(supplier.isActive).toBe(false);
      supplier.activate();
      expect(supplier.isActive).toBe(true);
    });
  });

  describe('Servicio de Aplicación SupplierService', () => {
    it('debe registrar un proveedor cuando el NIT no existe', async () => {
      const result = await service.createSupplier({
        taxId: '800555444-2',
        name: 'Laboratorios Baxter S.A.',
        email: 'contacto@baxter.com',
      });

      expect(result.taxId).toBe('800555444-2');
      expect(result.name).toBe('Laboratorios Baxter S.A.');
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('debe lanzar SupplierAlreadyExistsException si ya existe un proveedor con el mismo NIT', async () => {
      vi.mocked(repository.findByTaxId).mockResolvedValueOnce(
        Supplier.create({
          taxId: '800555444-2',
          name: 'Laboratorios Baxter Existente',
        }),
      );

      await expect(
        service.createSupplier({
          taxId: '800555444-2',
          name: 'Otro Laboratorio',
        }),
      ).rejects.toThrow(SupplierAlreadyExistsException);
    });

    it('debe obtener un proveedor por ID o lanzar SupplierNotFoundException', async () => {
      const existing = Supplier.create({
        taxId: '900111222-3',
        name: 'Drogas La Rebaja Mayorista',
      });
      vi.mocked(repository.findById).mockResolvedValueOnce(existing);

      const found = await service.getSupplierById(existing.id);
      expect(found.taxId).toBe('900111222-3');

      vi.mocked(repository.findById).mockResolvedValueOnce(null);
      await expect(service.getSupplierById('uuid-inexistente')).rejects.toThrow(
        SupplierNotFoundException,
      );
    });

    it('debe actualizar los datos del proveedor y rechazar colisión de NIT', async () => {
      const existing = Supplier.create({
        taxId: '900111222-3',
        name: 'Proveedor Original',
      });
      vi.mocked(repository.findById).mockResolvedValue(existing);

      // Intento con NIT duplicado de otro proveedor
      vi.mocked(repository.findByTaxId).mockResolvedValueOnce(
        Supplier.create({
          id: 'otro-proveedor-id',
          taxId: '900333444-5',
          name: 'Tercer Proveedor',
        }),
      );

      await expect(
        service.updateSupplier(existing.id, { taxId: '900333444-5' }, { roles: ['admin'] }),
      ).rejects.toThrow(SupplierAlreadyExistsException);

      // Actualización exitosa de nombre y teléfono
      vi.mocked(repository.findByTaxId).mockResolvedValueOnce(null);
      const updated = await service.updateSupplier(existing.id, {
        name: 'Proveedor Nombre Actualizado',
        phone: '6014445555',
      });

      expect(updated.name).toBe('Proveedor Nombre Actualizado');
      expect(updated.phone).toBe('6014445555');
      expect(repository.save).toHaveBeenCalled();
    });

    it('debe rechazar el cambio de NIT sin rol administrador y no persistir', async () => {
      const existing = Supplier.create({
        taxId: '900111222-3',
        name: 'Proveedor Original',
      });
      vi.mocked(repository.findById).mockResolvedValue(existing);

      await expect(
        service.updateSupplier(
          existing.id,
          { taxId: '900111222-4', name: 'No debe persistir' },
          { roles: ['compras'] },
        ),
      ).rejects.toThrow(SupplierTaxIdChangeForbiddenException);

      expect(existing.taxId).toBe('900111222-3');
      expect(existing.name).toBe('Proveedor Original');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('debe inactivar lógicamente al proveedor', async () => {
      const existing = Supplier.create({
        taxId: '900111222-3',
        name: 'Proveedor a Inactivar',
      });
      vi.mocked(repository.findById).mockResolvedValueOnce(existing);

      const deactivated = await service.deactivateSupplier(existing.id);
      expect(deactivated.isActive).toBe(false);
      expect(repository.save).toHaveBeenCalled();
    });
  });
});
