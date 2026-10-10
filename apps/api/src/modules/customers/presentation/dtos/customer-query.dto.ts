import { parsePaginationValue } from '../../../../common/pagination/pagination';
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
      filters.page = parsePaginationValue(record.page, 'page');
    }

    if (record.limit !== undefined) {
      filters.limit = parsePaginationValue(record.limit, 'limit');
    }

    return filters;
  }
}
