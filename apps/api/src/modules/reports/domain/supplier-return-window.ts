/**
 * Devoluciones a proveedor por vencimiento (acuerdo del 4 de octubre): los proveedores
 * reciben devoluciones hasta 3 meses (90 días) antes del vencimiento y se les avisa entre
 * 120 y 110 días antes para que retiren la mercancía.
 */
export const SUPPLIER_NOTICE_FROM_DAYS = 120;
export const SUPPLIER_NOTICE_UNTIL_DAYS = 110;
export const SUPPLIER_RETURN_LIMIT_DAYS = 90;

export type SupplierReturnStatus = 'AVISAR_AHORA' | 'AVISO_ATRASADO' | 'FUERA_DE_PLAZO';

/** null: aún no hay que avisar (más de 120 días) o el lote ya venció. */
export function supplierReturnStatus(daysRemaining: number): SupplierReturnStatus | null {
  if (daysRemaining > SUPPLIER_NOTICE_FROM_DAYS || daysRemaining <= 0) return null;
  if (daysRemaining >= SUPPLIER_NOTICE_UNTIL_DAYS) return 'AVISAR_AHORA';
  if (daysRemaining > SUPPLIER_RETURN_LIMIT_DAYS) return 'AVISO_ATRASADO';
  return 'FUERA_DE_PLAZO';
}
