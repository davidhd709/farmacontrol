export class CategoryNotFoundException extends Error {
  constructor(identifier: string) {
    super(`No se encontró la categoría con identificador: ${identifier}`);
    this.name = 'CategoryNotFoundException';
  }
}

export class CategoryAlreadyExistsException extends Error {
  constructor(name: string) {
    super(`Ya existe una categoría registrada con el nombre: "${name}".`);
    this.name = 'CategoryAlreadyExistsException';
  }
}

export class CategoryHasActiveProductsException extends Error {
  constructor(name: string) {
    super(
      `No se puede inactivar la categoría "${name}" porque tiene productos activos asociados.`
    );
    this.name = 'CategoryHasActiveProductsException';
  }
}
