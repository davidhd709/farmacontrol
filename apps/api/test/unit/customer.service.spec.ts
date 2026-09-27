import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerService } from '../../src/modules/customers/application/customer.service';
import { ICustomerRepository } from '../../src/modules/customers/domain/customer.repository';
import { Customer } from '../../src/modules/customers/domain/customer.entity';
import {
  CustomerNotFoundException,
  CustomerAlreadyExistsException,
  CustomerCannotBeDeactivatedException,
} from '../../src/modules/customers/domain/customer.exceptions';

describe('CustomerService & Customer Entity (Unit)', () => {
  let repository: ICustomerRepository;
  let service: CustomerService;

  beforeEach(() => {
    repository = {
      save: vi.fn(async () => {}),
      findById: vi.fn(async () => null),
      findByDocumentNumber: vi.fn(async () => null),
      findDefault: vi.fn(async () => null),
      findAll: vi.fn(async () => ({ items: [], total: 0 })),
    };

    service = new CustomerService(repository);
  });

  describe('Entidad de Dominio Customer', () => {
    it('debe crear un cliente válido con valores por defecto', () => {
      const customer = Customer.create({
        documentType: 'CC',
        documentNumber: '1020304050',
        name: 'Carlos Ruiz',
        phone: '3157894561',
        email: 'carlos.ruiz@example.com',
      });

      expect(customer.id).toBeDefined();
      expect(customer.documentType).toBe('CC');
      expect(customer.documentNumber).toBe('1020304050');
      expect(customer.name).toBe('Carlos Ruiz');
      expect(customer.isDefault).toBe(false);
      expect(customer.isActive).toBe(true);
      expect(customer.toDto().documentNumber).toBe('1020304050');
    });

    it('debe rechazar documento o nombre vacíos', () => {
      expect(() =>
        Customer.create({
          documentNumber: '   ',
          name: 'Cliente Prueba',
        })
      ).toThrow('El número de documento del cliente es obligatorio');

      expect(() =>
        Customer.create({
          documentNumber: '12345',
          name: '   ',
        })
      ).toThrow('El nombre o razón social del cliente es obligatorio');
    });

    it('no debe permitir desactivar el cliente por defecto', () => {
      const defaultCustomer = Customer.create({
        documentNumber: '222222222222',
        name: 'Consumidor Final',
        isDefault: true,
      });

      expect(() => defaultCustomer.deactivate()).toThrow(
        'No se puede inactivar el cliente predeterminado'
      );
      expect(() => defaultCustomer.update({ isActive: false })).toThrow(
        'No se puede desactivar el cliente predeterminado (Consumidor Final)'
      );
    });

    it('debe permitir actualizar datos de un cliente regular', () => {
      const customer = Customer.create({
        documentNumber: '1020304050',
        name: 'Carlos Ruiz',
        phone: '3157894561',
      });

      customer.update({
        name: 'Carlos Andrés Ruiz Gómez',
        phone: '3201112233',
        address: 'Calle 100 # 20-30',
      });

      expect(customer.name).toBe('Carlos Andrés Ruiz Gómez');
      expect(customer.phone).toBe('3201112233');
      expect(customer.address).toBe('Calle 100 # 20-30');
    });
  });

  describe('CustomerService (Casos de Uso)', () => {
    it('debe crear un nuevo cliente si el documento no está duplicado', async () => {
      const input = {
        documentType: 'CC',
        documentNumber: '1099887766',
        name: 'Diana Marcela Gómez',
        phone: '3001234567',
        email: 'diana.gomez@test.com',
      };

      const result = await service.createCustomer(input);

      expect(repository.findByDocumentNumber).toHaveBeenCalledWith('1099887766');
      expect(repository.save).toHaveBeenCalled();
      expect(result.documentNumber).toBe('1099887766');
      expect(result.name).toBe('Diana Marcela Gómez');
    });

    it('debe lanzar CustomerAlreadyExistsException si ya existe un cliente con ese documento', async () => {
      const existing = Customer.create({
        documentNumber: '1099887766',
        name: 'Diana Existente',
      });
      vi.mocked(repository.findByDocumentNumber).mockResolvedValueOnce(existing);

      await expect(
        service.createCustomer({
          documentNumber: '1099887766',
          name: 'Diana Duplicada',
        })
      ).rejects.toThrow(CustomerAlreadyExistsException);
    });

    it('debe lanzar CustomerNotFoundException al buscar un ID inexistente', async () => {
      vi.mocked(repository.findById).mockResolvedValueOnce(null);

      await expect(service.getCustomerById('uuid-no-existe')).rejects.toThrow(
        CustomerNotFoundException
      );
    });

    it('debe impedir inactivar al cliente por defecto', async () => {
      const defaultCustomer = Customer.create({
        documentNumber: '222222222222',
        name: 'Consumidor Final',
        isDefault: true,
      });
      vi.mocked(repository.findById).mockResolvedValueOnce(defaultCustomer);

      await expect(service.deactivateCustomer(defaultCustomer.id)).rejects.toThrow(
        CustomerCannotBeDeactivatedException
      );
    });

    it('debe permitir consultar el cliente por defecto para POS rápido', async () => {
      const defaultCustomer = Customer.create({
        documentNumber: '222222222222',
        name: 'Consumidor Final',
        isDefault: true,
      });
      vi.mocked(repository.findDefault).mockResolvedValueOnce(defaultCustomer);

      const res = await service.getDefaultCustomer();
      expect(res.documentNumber).toBe('222222222222');
      expect(res.isDefault).toBe(true);
    });
  });
});
