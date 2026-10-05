import { PipeTransform, Injectable } from '@nestjs/common';
import { ThirdPartyQueryFilters } from '@farmacia/contracts';

@Injectable()
export class ThirdPartyQueryValidationPipe implements PipeTransform {
  public transform(value: unknown): ThirdPartyQueryFilters {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const query = value as Record<string, unknown>;
    const filters: ThirdPartyQueryFilters = {};

    if (typeof query.search === 'string' && query.search.trim().length > 0) {
      filters.search = query.search.trim();
    }

    if (typeof query.role === 'string') {
      const r = query.role.trim().toUpperCase();
      if (['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER', 'ALL'].includes(r)) {
        filters.role = r as any;
      }
    }

    if (query.isActive !== undefined && query.isActive !== '') {
      filters.isActive = query.isActive === 'true' || query.isActive === true;
    }

    if (query.page !== undefined) {
      const parsedPage = Number(query.page);
      if (!isNaN(parsedPage) && parsedPage > 0) {
        filters.page = parsedPage;
      }
    }

    if (query.limit !== undefined) {
      const parsedLimit = Number(query.limit);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        filters.limit = parsedLimit;
      }
    } else if (query.pageSize !== undefined) {
      const parsedSize = Number(query.pageSize);
      if (!isNaN(parsedSize) && parsedSize > 0) {
        filters.limit = parsedSize;
      }
    }

    return filters;
  }
}
