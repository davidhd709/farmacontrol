import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CustomerDto,
  CreateCustomerPayload,
  UpdateCustomerPayload,
  CustomerQueryFilters,
  PaginatedResponse,
  SYSTEM_ROLES,
} from '@farmacia/contracts';
import { ICustomerRepository, CUSTOMER_REPOSITORY } from '../domain/customer.repository';
import { Customer } from '../domain/customer.entity';
import {
  CustomerNotFoundException,
  CustomerAlreadyExistsException,
  CustomerCannotBeDeactivatedException,
  CustomerDocumentChangeForbiddenException,
} from '../domain/customer.exceptions';
import { AuditService } from '../../audit/application/services/audit.service';
import { ThirdPartyService } from '../../third-parties/application/third-party.service';

export interface AuditContext {
  userId?: string | null;
  roles?: string[];
  ipAddress?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
    @Optional()
    private readonly auditService?: AuditService,
    @Optional()
    private readonly thirdPartyService?: ThirdPartyService,
  ) {}

  async createCustomer(input: CreateCustomerPayload, auditCtx?: AuditContext): Promise<Customer> {
    const existing = await this.customerRepository.findByDocumentNumber(input.documentNumber);
    if (existing) {
      throw new CustomerAlreadyExistsException(input.documentNumber);
    }

    const customer = Customer.create({
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      isDefault: input.isDefault,
    });

    await this.customerRepository.save(customer);
    // Terceros unificado: el cliente creado en el POS también queda como tercero
    await this.thirdPartyService?.registerRole('customer', {
      id: customer.id,
      documentType: customer.documentType,
      documentNumber: customer.documentNumber,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    });

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'customers:customer_created',
        entity: 'Customer',
        entityId: customer.id,
        userId: auditCtx?.userId || null,
        details: {
          documentType: customer.documentType,
          documentNumber: customer.documentNumber,
          name: customer.name,
          isDefault: customer.isDefault,
        },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return customer;
  }

  async updateCustomer(
    id: string,
    input: UpdateCustomerPayload,
    auditCtx?: AuditContext,
  ): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new CustomerNotFoundException(id);
    }

    if (customer.isDefault && input.isActive === false) {
      throw new CustomerCannotBeDeactivatedException();
    }

    const nextDocumentNumber = input.documentNumber?.trim();
    if (nextDocumentNumber !== undefined && nextDocumentNumber !== customer.documentNumber) {
      if (!auditCtx?.roles?.includes(SYSTEM_ROLES.ADMIN)) {
        throw new CustomerDocumentChangeForbiddenException();
      }
      const duplicate = await this.customerRepository.findByDocumentNumber(nextDocumentNumber);
      if (duplicate && duplicate.id !== id) {
        throw new CustomerAlreadyExistsException(nextDocumentNumber);
      }
    }

    customer.update({
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      isActive: input.isActive,
    });

    await this.customerRepository.save(customer);

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'customers:customer_updated',
        entity: 'Customer',
        entityId: customer.id,
        userId: auditCtx?.userId || null,
        details: {
          changes: input,
          name: customer.name,
          isActive: customer.isActive,
        },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return customer;
  }

  async deactivateCustomer(id: string, auditCtx?: AuditContext): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new CustomerNotFoundException(id);
    }

    if (customer.isDefault) {
      throw new CustomerCannotBeDeactivatedException();
    }

    customer.deactivate();
    await this.customerRepository.save(customer);

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'customers:customer_deactivated',
        entity: 'Customer',
        entityId: customer.id,
        userId: auditCtx?.userId || null,
        details: { documentNumber: customer.documentNumber, name: customer.name },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return customer;
  }

  async activateCustomer(id: string, auditCtx?: AuditContext): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new CustomerNotFoundException(id);
    }

    customer.activate();
    await this.customerRepository.save(customer);

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'customers:customer_activated',
        entity: 'Customer',
        entityId: customer.id,
        userId: auditCtx?.userId || null,
        details: { documentNumber: customer.documentNumber, name: customer.name },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return customer;
  }

  async getCustomerById(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new CustomerNotFoundException(id);
    }
    return customer;
  }

  async getDefaultCustomer(): Promise<Customer> {
    const customer = await this.customerRepository.findDefault();
    if (!customer) {
      throw new CustomerNotFoundException('default');
    }
    return customer;
  }

  async getCustomers(filters: CustomerQueryFilters): Promise<PaginatedResponse<CustomerDto>> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const { items, total } = await this.customerRepository.findAll(filters);

    return {
      items: items.map((c) => c.toDto()),
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
