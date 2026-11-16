import { parsePaginationValue } from '../../../../common/pagination/pagination';
import { PipeTransform, Injectable } from '@nestjs/common';
import { ThirdPartyQueryFilters } from '@farmacia/contracts';

const ROLE_FILTERS = ['CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OTHER', 'ALL'] as const;

function isThirdPartyRoleFilter(
  value: string,
): value is NonNullable<ThirdPartyQueryFilters['role']> {
  return (ROLE_FILTERS as readonly string[]).includes(value);
}

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
      if (isThirdPartyRoleFilter(r)) {
        filters.role = r;
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
