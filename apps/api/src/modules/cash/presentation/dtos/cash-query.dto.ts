import { PipeTransform, Injectable } from '@nestjs/common';
import {
  CashMovementType,
  PaymentMethod,
  CashMovementQueryFilters,
} from '@farmacia/contracts';

export class CashMovementQueryDto implements CashMovementQueryFilters {
  movementType?: CashMovementType;
  paymentMethod?: PaymentMethod;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class CashMovementQueryValidationPipe implements PipeTransform {
  public transform(value: unknown): CashMovementQueryDto {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const query = value as Record<string, unknown>;
    const result: CashMovementQueryDto = {};

    if (typeof query.movementType === 'string' && query.movementType.trim()) {
      result.movementType = query.movementType.trim() as CashMovementType;
    }

    if (typeof query.paymentMethod === 'string' && query.paymentMethod.trim()) {
      result.paymentMethod = query.paymentMethod.trim() as PaymentMethod;
    }

    if (typeof query.startDate === 'string' && query.startDate.trim()) {
      result.startDate = query.startDate.trim();
    }

    if (typeof query.endDate === 'string' && query.endDate.trim()) {
      result.endDate = query.endDate.trim();
    }

    if (query.page !== undefined) {
      const page = parseInt(String(query.page), 10);
      if (!isNaN(page) && page > 0) {
        result.page = page;
      }
    }

    if (query.limit !== undefined) {
      const limit = parseInt(String(query.limit), 10);
      if (!isNaN(limit) && limit > 0) {
        result.limit = limit;
      }
    }

    return result;
  }
}
