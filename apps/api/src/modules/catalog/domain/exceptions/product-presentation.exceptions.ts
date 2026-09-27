import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

export class ProductPresentationNotFoundException extends NotFoundException {
  constructor(id: string) {
    super(`La presentación comercial con ID "${id}" no existe.`);
  }
}

export class ProductPresentationNameAlreadyExistsException extends ConflictException {
  constructor(productName: string, presentationName: string) {
    super(
      `El producto "${productName}" ya cuenta con una presentación comercial denominada "${presentationName}".`,
    );
  }
}

export class ProductPresentationBarcodeAlreadyExistsException extends ConflictException {
  constructor(barcode: string) {
    super(
      `Ya existe una presentación comercial registrada con el código de barras "${barcode}".`,
    );
  }
}

export class CannotDeactivateDefaultPresentationException extends BadRequestException {
  constructor() {
    super(
      'No se puede inactivar la presentación predeterminada del producto. Asigna otra presentación como predeterminada primero.',
    );
  }
}

export class InvalidConversionQuantityException extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

export class ProductPresentationSelfReferenceException extends BadRequestException {
  constructor() {
    super('Una presentación no puede contenerse a sí misma.');
  }
}

export class ProductPresentationCrossProductException extends BadRequestException {
  constructor() {
    super('Una presentación solo puede contener presentaciones del mismo producto.');
  }
}

export class ProductPresentationCycleException extends BadRequestException {
  constructor(details?: string) {
    super(
      details
        ? `Se detectó un ciclo en la jerarquía de empaques: ${details}`
        : 'La configuración de empaque genera una referencia circular no permitida.',
    );
  }
}

export class ProductPresentationInvalidQuantityException extends BadRequestException {
  constructor(quantityOrMessage?: number | string) {
    if (typeof quantityOrMessage === 'number') {
      super(`La cantidad contenida (${quantityOrMessage}) debe ser un número entero mayor a cero.`);
    } else {
      super(quantityOrMessage || 'La cantidad contenida debe ser un número entero mayor a cero.');
    }
  }
}
