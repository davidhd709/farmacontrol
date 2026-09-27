import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type {
  CreateInventoryLotPayload,
  CreateLocationPayload,
} from '@farmacia/contracts';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateInventoryLotDto implements CreateInventoryLotPayload {
  productId!: string;
  locationId!: string;
  lotNumber!: string;
  expirationDate!: string;
  initialQuantity?: number;
}

export class CreateLocationDto implements CreateLocationPayload {
  code!: string;
  name!: string;
  description?: string | null;
  isDefault?: boolean;
}

@Injectable()
export class CreateInventoryLotValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateInventoryLotDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(
        'El cuerpo de la solicitud debe ser un objeto JSON válido.',
      );
    }

    const record = value as Record<string, unknown>;

    if (
      typeof record.productId !== 'string' ||
      !UUID_REGEX.test(record.productId.trim())
    ) {
      throw new BadRequestException(
        'El campo "productId" es obligatorio y debe ser un UUID válido.',
      );
    }

    if (
      typeof record.locationId !== 'string' ||
      !UUID_REGEX.test(record.locationId.trim())
    ) {
      throw new BadRequestException(
        'El campo "locationId" es obligatorio y debe ser un UUID válido.',
      );
    }

    if (
      typeof record.lotNumber !== 'string' ||
      record.lotNumber.trim().length === 0
    ) {
      throw new BadRequestException(
        'El campo "lotNumber" es obligatorio y no puede estar vacío.',
      );
    }

    if (
      typeof record.expirationDate !== 'string' ||
      !ISO_DATE_REGEX.test(record.expirationDate.trim())
    ) {
      throw new BadRequestException(
        'El campo "expirationDate" es obligatorio y debe tener formato ISO YYYY-MM-DD.',
      );
    }

    let initialQuantity = 0;
    if (record.initialQuantity !== undefined && record.initialQuantity !== null) {
      if (
        typeof record.initialQuantity !== 'number' ||
        !Number.isInteger(record.initialQuantity) ||
        record.initialQuantity < 0
      ) {
        throw new BadRequestException(
          'El campo "initialQuantity" debe ser un número entero mayor o igual a 0.',
        );
      }
      initialQuantity = record.initialQuantity;
    }

    return {
      productId: record.productId.trim(),
      locationId: record.locationId.trim(),
      lotNumber: record.lotNumber.trim().toUpperCase(),
      expirationDate: record.expirationDate.trim(),
      initialQuantity,
    };
  }
}

@Injectable()
export class CreateLocationValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateLocationDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(
        'El cuerpo de la solicitud debe ser un objeto JSON válido.',
      );
    }

    const record = value as Record<string, unknown>;

    if (typeof record.code !== 'string' || record.code.trim().length === 0) {
      throw new BadRequestException('El campo "code" es obligatorio.');
    }

    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw new BadRequestException('El campo "name" es obligatorio.');
    }

    return {
      code: record.code.trim().toUpperCase(),
      name: record.name.trim(),
      description:
        typeof record.description === 'string'
          ? record.description.trim()
          : null,
      isDefault: Boolean(record.isDefault),
    };
  }
}
