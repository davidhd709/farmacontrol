import { Sale } from './sale.entity';
import { SaleQueryFilters } from '@farmacia/contracts';

export const SALE_REPOSITORY = Symbol('SALE_REPOSITORY');

export interface ISaleRepository {
  save(sale: Sale, tx?: any): Promise<void>;
  findById(id: string, tx?: any): Promise<Sale | null>;
  findByInvoiceNumber(invoiceNumber: string, tx?: any): Promise<Sale | null>;
  findAll(filters: SaleQueryFilters): Promise<{ items: Sale[]; total: number }>;
  generateNextInvoiceNumber(tx?: any): Promise<string>;
}
