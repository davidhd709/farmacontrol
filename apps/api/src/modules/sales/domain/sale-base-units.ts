import { DomainError } from '../../../common/domain-error';

/** Conversión compartida por confirmación y vista previa, sin redondear fracciones de unidad. */
export function saleBaseUnits(quantityCommercial: number, factor: number): number {
  if (!Number.isFinite(quantityCommercial) || quantityCommercial <= 0) {
    throw new DomainError('La cantidad vendida debe ser mayor a cero', 'validation');
  }
  const exactBaseUnits = quantityCommercial * factor;
  const quantityBaseUnits = Math.round(exactBaseUnits);
  if (
    !Number.isSafeInteger(quantityBaseUnits) ||
    quantityBaseUnits <= 0 ||
    Math.abs(exactBaseUnits - quantityBaseUnits) > 1e-6
  ) {
    throw new DomainError(
      `La cantidad ${quantityCommercial} con factor ${factor} no equivale a unidades base enteras.`,
      'validation',
    );
  }
  return quantityBaseUnits;
}
