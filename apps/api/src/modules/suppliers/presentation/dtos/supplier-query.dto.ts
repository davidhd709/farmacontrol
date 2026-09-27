import { PipeTransform, Injectable } from '@nestjs/common';
import { SupplierQueryFilters } from '@farmacia/contracts';

@Injectable()
export class SupplierQueryValidationPipe implements PipeTransform {
  public transform(value: unknown): SupplierQueryFilters {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const record = value as Record<string, unknown>;
    const filters: SupplierQueryFilters = {};

    if (typeof record.search === 'string' && record.search.trim()) {
      filters.search = record.search.trim();
    }

    if (record.isActive !== undefined) {
      if (record.isActive === 'true' || record.isActive === true) {
        filters.isActive = true;
      } else if (record.isActive === 'false' || record.isActive === false) {
        filters.isActive = false;
      }
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
