import { parsePaginationValue } from '../../../../common/pagination/pagination';
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
      filters.page = parsePaginationValue(query.page, 'page');
    }

    const parsedPageSize = parsePaginationValue(query.pageSize, 'pageSize');
    if (query.limit !== undefined) {
      filters.limit = parsePaginationValue(query.limit, 'limit');
    } else {
      filters.limit = parsedPageSize;
    }

    return filters;
  }
}
