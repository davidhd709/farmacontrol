import { Sale } from './sale.entity';
import { SaleQueryFilters } from '@farmacia/contracts';

export const SALE_REPOSITORY = Symbol('SALE_REPOSITORY');

/** `tx` es el cliente transaccional del caso de uso; el dominio no conoce su tipo. */
export interface ISaleRepository {
  save(sale: Sale, tx?: unknown): Promise<void>;
  findById(id: string, tx?: unknown): Promise<Sale | null>;
  findByInvoiceNumber(invoiceNumber: string, tx?: unknown): Promise<Sale | null>;
  findAll(filters: SaleQueryFilters): Promise<{ items: Sale[]; total: number }>;
  generateNextInvoiceNumber(tx?: unknown): Promise<string>;
}
