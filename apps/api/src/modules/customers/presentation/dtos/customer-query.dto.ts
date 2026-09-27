import { PipeTransform, Injectable } from '@nestjs/common';
import { CustomerQueryFilters } from '@farmacia/contracts';

@Injectable()
export class CustomerQueryValidationPipe implements PipeTransform {
  public transform(value: unknown): CustomerQueryFilters {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const record = value as Record<string, unknown>;
    const filters: CustomerQueryFilters = {};

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

    if (record.limit !== undefined) {
      const parsed = parseInt(String(record.limit), 10);
      if (!isNaN(parsed) && parsed > 0) {
        filters.limit = Math.min(100, parsed);
      }
    }

    return filters;
  }
}
