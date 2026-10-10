export type DomainErrorKind =
  'validation' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict';

/** Error de negocio independiente del transporte y de la persistencia. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly kind: DomainErrorKind,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
