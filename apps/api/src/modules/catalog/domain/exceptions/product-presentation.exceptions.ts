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
