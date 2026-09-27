export class ProductNotFoundException extends Error {
  constructor(identifier: string) {
    super(`El producto con identificador "${identifier}" no fue encontrado.`);
    this.name = 'ProductNotFoundException';
  }
}

export class ProductCodeAlreadyExistsException extends Error {
  constructor(code: string) {
    super(`Ya existe un producto registrado con el código interno (SKU) "${code}".`);
    this.name = 'ProductCodeAlreadyExistsException';
  }
}

export class ProductBarcodeAlreadyExistsException extends Error {
  constructor(barcode: string) {
    super(`Ya existe un producto registrado con el código de barras "${barcode}".`);
    this.name = 'ProductBarcodeAlreadyExistsException';
  }
}

export class ProductCategoryNotFoundException extends Error {
  constructor(categoryId: string) {
    super(`La categoría con ID "${categoryId}" no existe o se encuentra inactiva.`);
    this.name = 'ProductCategoryNotFoundException';
  }
}
