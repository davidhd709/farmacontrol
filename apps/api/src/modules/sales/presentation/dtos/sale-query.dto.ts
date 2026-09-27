import { PipeTransform, Injectable } from '@nestjs/common';
import { SaleQueryFilters, SaleStatus } from '@farmacia/contracts';

@Injectable()
export class SaleQueryValidationPipe implements PipeTransform {
  public transform(value: unknown): SaleQueryFilters {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const record = value as Record<string, unknown>;
    const filters: SaleQueryFilters = {};

    if (typeof record.invoiceNumber === 'string' && record.invoiceNumber.trim()) {
      filters.invoiceNumber = record.invoiceNumber.trim();
    }

    if (typeof record.customerId === 'string' && record.customerId.trim()) {
      filters.customerId = record.customerId.trim();
    }

    if (typeof record.fromDate === 'string' && record.fromDate.trim()) {
      filters.fromDate = record.fromDate.trim();
    }

    if (typeof record.toDate === 'string' && record.toDate.trim()) {
      filters.toDate = record.toDate.trim();
    }

    if (record.status === 'COMPLETED' || record.status === 'CANCELLED') {
      filters.status = record.status as SaleStatus;
    }

    if (record.page !== undefined) {
      const parsed = parseInt(String(record.page), 10);
      if (!isNaN(parsed) && parsed > 0) {
        filters.page = parsed;
      }
    }

    if (record.limit !== undefined) {
      const parsed = parseInt(String(record.limit), 10);
      if (!isNaN(parsed) && parsed > 0) {
        filters.limit = Math.min(100, parsed);
      }
    }

    return filters;
  }
}
