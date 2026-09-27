import { PipeTransform, Injectable } from '@nestjs/common';
import { PurchaseQueryFilters } from '@farmacia/contracts';

@Injectable()
export class PurchaseQueryValidationPipe implements PipeTransform {
  public transform(value: unknown): PurchaseQueryFilters {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const record = value as Record<string, unknown>;
    const filters: PurchaseQueryFilters = {};

    if (typeof record.supplierId === 'string' && record.supplierId.trim()) {
      filters.supplierId = record.supplierId.trim();
    }
    if (typeof record.invoiceNumber === 'string' && record.invoiceNumber.trim()) {
      filters.invoiceNumber = record.invoiceNumber.trim();
    }
    if (typeof record.status === 'string' && record.status.trim()) {
      filters.status = record.status.trim();
    }
    if (typeof record.fromDate === 'string' && record.fromDate.trim()) {
      filters.fromDate = record.fromDate.trim();
    }
    if (typeof record.toDate === 'string' && record.toDate.trim()) {
      filters.toDate = record.toDate.trim();
    }

    if (record.page !== undefined) {
      const parsed = parseInt(String(record.page), 10);
      if (!isNaN(parsed) && parsed > 0) {
        filters.page = parsed;
      }
    }

    if (record.pageSize !== undefined) {
      const parsed = parseInt(String(record.pageSize), 10);
      if (!isNaN(parsed) && parsed > 0) {
        filters.pageSize = Math.min(100, parsed);
      }
    }

    return filters;
  }
}
