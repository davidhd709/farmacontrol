import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { CreateProductPayload } from '@farmacia/contracts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateProductDto implements CreateProductPayload {
  categoryId!: string;
  code!: string;
  barcode?: string | null;
  name!: string;
  genericName?: string | null;
  concentration?: string | null;
  sanitaryRegistry?: string | null;
  manufacturer?: string | null;
  description?: string | null;
  requiresLotControl?: boolean;
  prescriptionRequired?: boolean;
  baseUnit?: string;
  basePrice!: number | string;
  baseCost?: number | string;
}

@Injectable()
export class CreateProductValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateProductDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    // categoryId
    if (typeof record.categoryId !== 'string' || !UUID_REGEX.test(record.categoryId.trim())) {
      throw new BadRequestException('El campo "categoryId" es obligatorio y debe ser un UUID válido.');
    }

    // code (SKU)
    if (typeof record.code !== 'string') {
      throw new BadRequestException('El campo "code" es obligatorio y debe ser texto.');
    }
    const code = record.code.trim();
    if (code.length < 2 || code.length > 50) {
      throw new BadRequestException('El código interno (SKU) debe tener entre 2 y 50 caracteres.');
    }

    // name
    if (typeof record.name !== 'string') {
      throw new BadRequestException('El campo "name" es obligatorio y debe ser texto.');
    }
    const name = record.name.trim();
    if (name.length < 2 || name.length > 150) {
      throw new BadRequestException('El nombre del producto debe tener entre 2 y 150 caracteres.');
    }

    // barcode
    let barcode: string | null = null;
    if (record.barcode !== undefined && record.barcode !== null) {
      if (typeof record.barcode !== 'string') {
        throw new BadRequestException('El campo "barcode" debe ser texto.');
      }
      const trimmedBarcode = record.barcode.trim();
      if (trimmedBarcode) {
        if (trimmedBarcode.length < 3 || trimmedBarcode.length > 50) {
          throw new BadRequestException('El código de barras debe tener entre 3 y 50 caracteres.');
        }
        barcode = trimmedBarcode;
      }
    }

    // basePrice
    if (record.basePrice === undefined || record.basePrice === null) {
      throw new BadRequestException('El campo "basePrice" es obligatorio.');
    }
    const basePriceNum =
      typeof record.basePrice === 'number'
        ? record.basePrice
        : parseFloat(String(record.basePrice));
    if (isNaN(basePriceNum) || basePriceNum < 0) {
      throw new BadRequestException('El precio base debe ser un número mayor o igual a 0.');
    }

    // baseCost
    let baseCost = 0;
    if (record.baseCost !== undefined && record.baseCost !== null) {
      const num =
        typeof record.baseCost === 'number'
          ? record.baseCost
          : parseFloat(String(record.baseCost));
      if (isNaN(num) || num < 0) {
        throw new BadRequestException('El costo base debe ser un número mayor o igual a 0.');
      }
      baseCost = num;
    }

    // optional string fields
    const genericName =
      typeof record.genericName === 'string' && record.genericName.trim()
        ? record.genericName.trim()
        : null;
    const concentration =
      typeof record.concentration === 'string' && record.concentration.trim()
        ? record.concentration.trim()
        : null;
    const sanitaryRegistry =
      typeof record.sanitaryRegistry === 'string' && record.sanitaryRegistry.trim()
        ? record.sanitaryRegistry.trim()
        : null;
    const manufacturer =
      typeof record.manufacturer === 'string' && record.manufacturer.trim()
        ? record.manufacturer.trim()
        : null;
    const description =
      typeof record.description === 'string' && record.description.trim()
        ? record.description.trim()
        : null;

    const baseUnit =
      typeof record.baseUnit === 'string' && record.baseUnit.trim()
        ? record.baseUnit.trim().toUpperCase()
        : 'UNIDAD';

    const requiresLotControl =
      record.requiresLotControl !== undefined ? Boolean(record.requiresLotControl) : true;
    const prescriptionRequired =
      record.prescriptionRequired !== undefined ? Boolean(record.prescriptionRequired) : false;

    return {
      categoryId: record.categoryId.trim(),
      code,
      barcode,
      name,
      genericName,
      concentration,
      sanitaryRegistry,
      manufacturer,
      description,
      requiresLotControl,
      prescriptionRequired,
      baseUnit,
      basePrice: basePriceNum,
      baseCost,
    };
  }
}
