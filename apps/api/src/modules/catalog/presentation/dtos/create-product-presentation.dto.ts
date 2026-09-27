import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { CreateProductPresentationPayload } from '@farmacia/contracts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateProductPresentationDto implements CreateProductPresentationPayload {
  productId?: string;
  unitOfMeasureId?: string | null;
  containedPresentationId?: string | null;
  name?: string;
  barcode?: string | null;
  quantityContained?: number;
  conversionFactor?: number;
  price!: number | string;
  cost?: number | string;
  purchaseEnabled?: boolean;
  saleEnabled?: boolean;
  isDefault?: boolean;
  isDefaultPurchase?: boolean;
  isDefaultSale?: boolean;
}

@Injectable()
export class CreateProductPresentationValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateProductPresentationDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    // productId (opcional en el body si viene en la ruta)
    let productId: string | undefined;
    if (record.productId !== undefined && record.productId !== null) {
      if (typeof record.productId !== 'string' || !UUID_REGEX.test(record.productId.trim())) {
        throw new BadRequestException('El campo "productId" debe ser un UUID válido.');
      }
      productId = record.productId.trim();
    }

    // unitOfMeasureId
    let unitOfMeasureId: string | null = null;
    if (record.unitOfMeasureId !== undefined && record.unitOfMeasureId !== null && record.unitOfMeasureId !== '') {
      if (typeof record.unitOfMeasureId !== 'string' || !UUID_REGEX.test(record.unitOfMeasureId.trim())) {
        throw new BadRequestException('El campo "unitOfMeasureId" debe ser un UUID válido.');
      }
      unitOfMeasureId = record.unitOfMeasureId.trim();
    }

    // containedPresentationId
    let containedPresentationId: string | null = null;
    if (record.containedPresentationId !== undefined && record.containedPresentationId !== null && record.containedPresentationId !== '') {
      if (typeof record.containedPresentationId !== 'string' || !UUID_REGEX.test(record.containedPresentationId.trim())) {
        throw new BadRequestException('El campo "containedPresentationId" debe ser un UUID válido.');
      }
      containedPresentationId = record.containedPresentationId.trim();
    }

    // name
    let name = '';
    if (record.name !== undefined && record.name !== null && typeof record.name === 'string') {
      name = record.name.trim();
    }
    if (name && (name.length < 1 || name.length > 100)) {
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

    // conversionFactor opcional o quantityContained
    let quantityContained = 1;
    let conversionFactor: number | undefined;

    if (record.conversionFactor !== undefined && record.conversionFactor !== null) {
      const factorNum = Number(record.conversionFactor);
      if (isNaN(factorNum) || !Number.isInteger(factorNum) || factorNum <= 0) {
        throw new BadRequestException('El factor de conversión debe ser un número entero estrictamente mayor a 0.');
      }
      conversionFactor = factorNum;
      quantityContained = factorNum;
    }

    if (record.quantityContained !== undefined && record.quantityContained !== null) {
      const qNum = Number(record.quantityContained);
      if (isNaN(qNum) || !Number.isInteger(qNum) || qNum <= 0) {
        throw new BadRequestException(
          'La cantidad contenida (quantityContained) debe ser un número entero estrictamente mayor a 0.',
        );
      }
      quantityContained = qNum;
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
    const isDefaultPurchase = record.isDefaultPurchase !== undefined ? Boolean(record.isDefaultPurchase) : false;
    const isDefaultSale = record.isDefaultSale !== undefined ? Boolean(record.isDefaultSale) : isDefault;
    const purchaseEnabled = record.purchaseEnabled !== undefined ? Boolean(record.purchaseEnabled) : true;
    const saleEnabled = record.saleEnabled !== undefined ? Boolean(record.saleEnabled) : true;

    return {
      productId,
      unitOfMeasureId,
      containedPresentationId,
      name,
      barcode,
      quantityContained,
      conversionFactor,
      price: priceNum,
      cost,
      purchaseEnabled,
      saleEnabled,
      isDefault,
      isDefaultPurchase,
      isDefaultSale,
    };
  }
}
