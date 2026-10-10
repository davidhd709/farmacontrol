import { DomainError } from '../../../../common/domain-error';

export class ProductPresentationNotFoundException extends DomainError {
  constructor(id: string) {
    super(`La presentación comercial con ID "${id}" no existe.`, 'not_found');
  }
}

export class ProductPresentationNameAlreadyExistsException extends DomainError {
  constructor(productName: string, presentationName: string) {
    super(
      `El producto "${productName}" ya cuenta con una presentación comercial denominada "${presentationName}".`,
      'conflict',
    );
  }
}

export class ProductPresentationBarcodeAlreadyExistsException extends DomainError {
  constructor(barcode: string) {
    super(
      `Ya existe una presentación comercial registrada con el código de barras "${barcode}".`,
      'conflict',
    );
  }
}

export class CannotDeactivateDefaultPresentationException extends DomainError {
  constructor() {
    super(
      'No se puede inactivar la presentación predeterminada del producto. Asigna otra presentación como predeterminada primero.',
      'validation',
    );
  }
}

export class InvalidConversionQuantityException extends DomainError {
  constructor(message: string) {
    super(message, 'validation');
  }
}

export class ProductPresentationSelfReferenceException extends DomainError {
  constructor() {
    super('Una presentación no puede contenerse a sí misma.', 'validation');
  }
}

export class ProductPresentationCrossProductException extends DomainError {
  constructor() {
    super('Una presentación solo puede contener presentaciones del mismo producto.', 'validation');
  }
}

export class ProductPresentationCycleException extends DomainError {
  constructor(details?: string) {
    super(
      details
        ? `Se detectó un ciclo en la jerarquía de empaques: ${details}`
        : 'La configuración de empaque genera una referencia circular no permitida.',
      'validation',
    );
  }
}

export class ProductPresentationInvalidQuantityException extends DomainError {
  constructor(quantityOrMessage?: number | string) {
    if (typeof quantityOrMessage === 'number') {
      super(
        `La cantidad contenida (${quantityOrMessage}) debe ser un número entero mayor a cero.`,
        'validation',
      );
    } else {
      super(
        quantityOrMessage || 'La cantidad contenida debe ser un número entero mayor a cero.',
        'validation',
      );
    }
  }
}
