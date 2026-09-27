import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { UpdateProductPresentationPayload } from '@farmacia/contracts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UpdateProductPresentationDto implements UpdateProductPresentationPayload {
  unitOfMeasureId?: string | null;
  containedPresentationId?: string | null;
  name?: string;
  barcode?: string | null;
  quantityContained?: number;
  conversionFactor?: number;
  price?: number | string;
  cost?: number | string;
  purchaseEnabled?: boolean;
  saleEnabled?: boolean;
  isDefault?: boolean;
  isDefaultPurchase?: boolean;
  isDefaultSale?: boolean;
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

    // unitOfMeasureId
    if (record.unitOfMeasureId !== undefined) {
      if (record.unitOfMeasureId === null || record.unitOfMeasureId === '') {
        result.unitOfMeasureId = null;
      } else {
        if (typeof record.unitOfMeasureId !== 'string' || !UUID_REGEX.test(record.unitOfMeasureId.trim())) {
          throw new BadRequestException('El campo "unitOfMeasureId" debe ser un UUID válido.');
        }
        result.unitOfMeasureId = record.unitOfMeasureId.trim();
      }
    }

    // containedPresentationId
    if (record.containedPresentationId !== undefined) {
      if (record.containedPresentationId === null || record.containedPresentationId === '') {
        result.containedPresentationId = null;
      } else {
        if (typeof record.containedPresentationId !== 'string' || !UUID_REGEX.test(record.containedPresentationId.trim())) {
          throw new BadRequestException('El campo "containedPresentationId" debe ser un UUID válido.');
        }
        result.containedPresentationId = record.containedPresentationId.trim();
      }
    }

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

    // quantityContained
    if (record.quantityContained !== undefined) {
      const qNum = Number(record.quantityContained);
      if (isNaN(qNum) || !Number.isInteger(qNum) || qNum <= 0) {
        throw new BadRequestException(
          'La cantidad contenida (quantityContained) debe ser un número entero mayor a 0.',
        );
      }
      result.quantityContained = qNum;
    }

    // conversionFactor opcional
    if (record.conversionFactor !== undefined) {
      const factorNum = Number(record.conversionFactor);
      if (isNaN(factorNum) || !Number.isInteger(factorNum) || factorNum <= 0) {
        throw new BadRequestException(
          'El factor de conversión debe ser un número entero mayor a 0.',
        );
      }
      result.conversionFactor = factorNum;
    }

    // price
    if (record.price !== undefined) {
      const priceNum = typeof record.price === 'number' ? record.price : parseFloat(String(record.price));
      if (isNaN(priceNum) || priceNum < 0) {
        throw new BadRequestException('El precio de la presentación debe ser un número mayor o igual a 0.');
      }
      result.price = priceNum;
    }

    // cost
    if (record.cost !== undefined) {
      const costNum = typeof record.cost === 'number' ? record.cost : parseFloat(String(record.cost));
      if (isNaN(costNum) || costNum < 0) {
        throw new BadRequestException('El costo de la presentación debe ser un número mayor o igual a 0.');
      }
      result.cost = costNum;
    }

    if (record.purchaseEnabled !== undefined) {
      result.purchaseEnabled = Boolean(record.purchaseEnabled);
    }
    if (record.saleEnabled !== undefined) {
      result.saleEnabled = Boolean(record.saleEnabled);
    }
    if (record.isDefault !== undefined) {
      result.isDefault = Boolean(record.isDefault);
    }
    if (record.isDefaultPurchase !== undefined) {
      result.isDefaultPurchase = Boolean(record.isDefaultPurchase);
    }
    if (record.isDefaultSale !== undefined) {
      result.isDefaultSale = Boolean(record.isDefaultSale);
    }
    if (record.isActive !== undefined) {
      result.isActive = Boolean(record.isActive);
    }

    return result;
  }
}
