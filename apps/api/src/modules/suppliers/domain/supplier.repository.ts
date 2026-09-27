import { Supplier } from './supplier.entity';
import { SupplierQueryFilters } from '@farmacia/contracts';

export const SUPPLIER_REPOSITORY = Symbol('SUPPLIER_REPOSITORY');

export interface ISupplierRepository {
  save(supplier: Supplier): Promise<void>;
  findById(id: string): Promise<Supplier | null>;
  findByTaxId(taxId: string): Promise<Supplier | null>;
  findAll(filters: SupplierQueryFilters): Promise<{ items: Supplier[]; total: number }>;
  delete(id: string): Promise<void>;
}
