import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { UpdateProductPresentationPayload } from '@farmacia/contracts';

export class UpdateProductPresentationDto implements UpdateProductPresentationPayload {
  name?: string;
  barcode?: string | null;
  conversionFactor?: number;
  price?: number | string;
  cost?: number | string;
  isDefault?: boolean;
  isActive?: boolean;
}

@Injectable()
export class UpdateProductPresentationValidationPipe implements PipeTransform {
  public transform(value: unknown): UpdateProductPresentationDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;
    const result: UpdateProductPresentationDto = {};

    // name
    if (record.name !== undefined) {
      if (typeof record.name !== 'string') {
        throw new BadRequestException('El campo "name" debe ser texto.');
      }
      const trimmed = record.name.trim();
      if (trimmed.length < 1 || trimmed.length > 100) {
        throw new BadRequestException('El nombre de la presentación debe tener entre 1 y 100 caracteres.');
      }
      result.name = trimmed;
    }

    // barcode
    if (record.barcode !== undefined) {
      if (record.barcode === null || record.barcode === '') {
        result.barcode = null;
      } else {
        if (typeof record.barcode !== 'string') {
          throw new BadRequestException('El campo "barcode" debe ser texto.');
        }
        const trimmed = record.barcode.trim();
        if (trimmed.length < 3 || trimmed.length > 50) {
          throw new BadRequestException('El código de barras debe tener entre 3 y 50 caracteres.');
        }
        result.barcode = trimmed;
      }
    }

    // conversionFactor
    if (record.conversionFactor !== undefined) {
      const factorNum = Number(record.conversionFactor);
      if (isNaN(factorNum) || !Number.isInteger(factorNum) || factorNum <= 0) {
        throw new BadRequestException(
          'El factor de conversión debe ser un número entero estrictamente mayor a 0 (RN-004, RN-AG-02).',
        );
      }
      result.conversionFactor = factorNum;
    }

    // price
    if (record.price !== undefined) {
      const priceNum =
        typeof record.price === 'number' ? record.price : parseFloat(String(record.price));
      if (isNaN(priceNum) || priceNum < 0) {
        throw new BadRequestException('El precio de la presentación debe ser un número mayor o igual a 0.');
      }
      result.price = priceNum;
    }

    // cost
    if (record.cost !== undefined) {
      const costNum =
        typeof record.cost === 'number' ? record.cost : parseFloat(String(record.cost));
      if (isNaN(costNum) || costNum < 0) {
        throw new BadRequestException('El costo de la presentación debe ser un número mayor o igual a 0.');
      }
      result.cost = costNum;
    }

    // isDefault
    if (record.isDefault !== undefined) {
      result.isDefault = Boolean(record.isDefault);
    }

    // isActive
    if (record.isActive !== undefined) {
      result.isActive = Boolean(record.isActive);
    }

    return result;
  }
}
