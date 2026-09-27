import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { UpdateProductPayload } from '@farmacia/contracts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UpdateProductDto implements UpdateProductPayload {
  categoryId?: string;
  code?: string;
  barcode?: string | null;
  name?: string;
  genericName?: string | null;
  concentration?: string | null;
  sanitaryRegistry?: string | null;
  manufacturer?: string | null;
  description?: string | null;
  requiresLotControl?: boolean;
  prescriptionRequired?: boolean;
  baseUnit?: string;
  basePrice?: number | string;
  baseCost?: number | string;
  isActive?: boolean;
}

@Injectable()
export class UpdateProductValidationPipe implements PipeTransform {
  public transform(value: unknown): UpdateProductDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;
    const result: UpdateProductDto = {};

    // categoryId
    if (record.categoryId !== undefined) {
      if (typeof record.categoryId !== 'string' || !UUID_REGEX.test(record.categoryId.trim())) {
        throw new BadRequestException('El campo "categoryId" debe ser un UUID válido.');
      }
      result.categoryId = record.categoryId.trim();
    }

    // code (SKU)
    if (record.code !== undefined) {
      if (typeof record.code !== 'string') {
        throw new BadRequestException('El campo "code" debe ser texto.');
      }
      const code = record.code.trim();
      if (code.length < 2 || code.length > 50) {
        throw new BadRequestException('El código interno (SKU) debe tener entre 2 y 50 caracteres.');
      }
      result.code = code;
    }

    // name
    if (record.name !== undefined) {
      if (typeof record.name !== 'string') {
        throw new BadRequestException('El campo "name" debe ser texto.');
      }
      const name = record.name.trim();
      if (name.length < 2 || name.length > 150) {
        throw new BadRequestException('El nombre del producto debe tener entre 2 y 150 caracteres.');
      }
      result.name = name;
    }

    // barcode
    if (record.barcode !== undefined) {
      if (record.barcode === null || record.barcode === '') {
        result.barcode = null;
      } else {
        if (typeof record.barcode !== 'string') {
          throw new BadRequestException('El campo "barcode" debe ser texto o nulo.');
        }
        const trimmed = record.barcode.trim();
        if (trimmed.length < 3 || trimmed.length > 50) {
          throw new BadRequestException('El código de barras debe tener entre 3 y 50 caracteres.');
        }
        result.barcode = trimmed;
      }
    }

    // basePrice
    if (record.basePrice !== undefined) {
      const num =
        typeof record.basePrice === 'number'
          ? record.basePrice
          : parseFloat(String(record.basePrice));
      if (isNaN(num) || num < 0) {
        throw new BadRequestException('El precio base debe ser un número mayor o igual a 0.');
      }
      result.basePrice = num;
    }

    // baseCost
    if (record.baseCost !== undefined) {
      const num =
        typeof record.baseCost === 'number'
          ? record.baseCost
          : parseFloat(String(record.baseCost));
      if (isNaN(num) || num < 0) {
        throw new BadRequestException('El costo base debe ser un número mayor o igual a 0.');
      }
      result.baseCost = num;
    }

    // Optional text fields
    if (record.genericName !== undefined) {
      result.genericName =
        typeof record.genericName === 'string' && record.genericName.trim()
          ? record.genericName.trim()
          : null;
    }

    if (record.concentration !== undefined) {
      result.concentration =
        typeof record.concentration === 'string' && record.concentration.trim()
          ? record.concentration.trim()
          : null;
    }

    if (record.sanitaryRegistry !== undefined) {
      result.sanitaryRegistry =
        typeof record.sanitaryRegistry === 'string' && record.sanitaryRegistry.trim()
          ? record.sanitaryRegistry.trim()
          : null;
    }

    if (record.manufacturer !== undefined) {
      result.manufacturer =
        typeof record.manufacturer === 'string' && record.manufacturer.trim()
          ? record.manufacturer.trim()
          : null;
    }

    if (record.description !== undefined) {
      result.description =
        typeof record.description === 'string' && record.description.trim()
          ? record.description.trim()
          : null;
    }

    if (record.baseUnit !== undefined) {
      result.baseUnit =
        typeof record.baseUnit === 'string' && record.baseUnit.trim()
          ? record.baseUnit.trim().toUpperCase()
          : 'UNIDAD';
    }

    if (record.requiresLotControl !== undefined) {
      result.requiresLotControl = Boolean(record.requiresLotControl);
    }

    if (record.prescriptionRequired !== undefined) {
      result.prescriptionRequired = Boolean(record.prescriptionRequired);
    }

    if (record.isActive !== undefined) {
      result.isActive = Boolean(record.isActive);
    }

    return result;
  }
}
