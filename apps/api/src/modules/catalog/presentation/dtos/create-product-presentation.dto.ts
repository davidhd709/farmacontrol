import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { CreateProductPresentationPayload } from '@farmacia/contracts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateProductPresentationDto implements CreateProductPresentationPayload {
  productId!: string;
  name!: string;
  barcode?: string | null;
  conversionFactor!: number;
  price!: number | string;
  cost?: number | string;
  isDefault?: boolean;
}

@Injectable()
export class CreateProductPresentationValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateProductPresentationDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    // productId (may come from route or body)
    let productId = '';
    if (record.productId !== undefined && record.productId !== null) {
      if (typeof record.productId !== 'string' || !UUID_REGEX.test(record.productId.trim())) {
        throw new BadRequestException('El campo "productId" debe ser un UUID válido.');
      }
      productId = record.productId.trim();
    }

    // name
    if (typeof record.name !== 'string') {
      throw new BadRequestException('El campo "name" es obligatorio y debe ser texto.');
    }
    const name = record.name.trim();
    if (name.length < 1 || name.length > 100) {
      throw new BadRequestException('El nombre de la presentación debe tener entre 1 y 100 caracteres.');
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

    // conversionFactor
    if (record.conversionFactor === undefined || record.conversionFactor === null) {
      throw new BadRequestException('El campo "conversionFactor" es obligatorio.');
    }
    const factorNum = Number(record.conversionFactor);
    if (isNaN(factorNum) || !Number.isInteger(factorNum) || factorNum <= 0) {
      throw new BadRequestException(
        'El factor de conversión debe ser un número entero estrictamente mayor a 0 (RN-004, RN-AG-02).',
      );
    }

    // price
    if (record.price === undefined || record.price === null) {
      throw new BadRequestException('El campo "price" es obligatorio.');
    }
    const priceNum = typeof record.price === 'number' ? record.price : parseFloat(String(record.price));
    if (isNaN(priceNum) || priceNum < 0) {
      throw new BadRequestException('El precio de la presentación debe ser un número mayor o igual a 0.');
    }

    // cost
    let cost = 0;
    if (record.cost !== undefined && record.cost !== null) {
      const num = typeof record.cost === 'number' ? record.cost : parseFloat(String(record.cost));
      if (isNaN(num) || num < 0) {
        throw new BadRequestException('El costo de la presentación debe ser un número mayor o igual a 0.');
      }
      cost = num;
    }

    const isDefault = record.isDefault !== undefined ? Boolean(record.isDefault) : false;

    return {
      productId,
      name,
      barcode,
      conversionFactor: factorNum,
      price: priceNum,
      cost,
      isDefault,
    };
  }
}
