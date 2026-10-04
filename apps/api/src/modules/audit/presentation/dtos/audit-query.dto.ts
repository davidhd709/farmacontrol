import { PipeTransform, Injectable } from '@nestjs/common';
import { AuditQueryFilters } from '@farmacia/contracts';

@Injectable()
export class AuditQueryValidationPipe implements PipeTransform {
  public transform(value: unknown): AuditQueryFilters {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const record = value as Record<string, unknown>;
    const filters: AuditQueryFilters = {};

    if (typeof record.userId === 'string' && record.userId.trim()) {
      filters.userId = record.userId.trim();
    }

    if (typeof record.action === 'string' && record.action.trim()) {
      filters.action = record.action.trim();
    }

    if (typeof record.entity === 'string' && record.entity.trim()) {
      filters.entity = record.entity.trim();
    }

    if (typeof record.entityId === 'string' && record.entityId.trim()) {
      filters.entityId = record.entityId.trim();
    }

    if (typeof record.correlationId === 'string' && record.correlationId.trim()) {
      filters.correlationId = record.correlationId.trim();
    }

    if (typeof record.fromDate === 'string' && record.fromDate.trim()) {
      filters.fromDate = record.fromDate.trim();
    }

    if (typeof record.toDate === 'string' && record.toDate.trim()) {
      filters.toDate = record.toDate.trim();
    }

    if (typeof record.search === 'string' && record.search.trim()) {
      filters.search = record.search.trim();
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
