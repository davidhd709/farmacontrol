import { Customer } from './customer.entity';
import { CustomerQueryFilters } from '@farmacia/contracts';

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export interface ICustomerRepository {
  save(customer: Customer): Promise<void>;
  findById(id: string): Promise<Customer | null>;
  findByDocumentNumber(documentNumber: string): Promise<Customer | null>;
  findDefault(): Promise<Customer | null>;
  findAll(filters: CustomerQueryFilters): Promise<{ items: Customer[]; total: number }>;
}
