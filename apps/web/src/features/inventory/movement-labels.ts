import type { InventoryMovementType } from '@farmacia/contracts';

/**
 * Etiquetas en español de los códigos internos del Kardex. Solo cambian lo que se muestra:
 * los filtros y el API siguen usando el código original.
 */
export const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  SALIDA_VENTA: 'Salida por venta',
  AJUSTE_POSITIVO: 'Ajuste positivo',
  AJUSTE_NEGATIVO: 'Ajuste negativo',
  DEVOLUCION_CLIENTE: 'Devolución de cliente',
  DEVOLUCION_PROVEEDOR: 'Devolución a proveedor',
  TRASLADO_ENTRADA: 'Traslado (entrada)',
  TRASLADO_SALIDA: 'Traslado (salida)',
  ENTRADA_DEVOLUCION_VENTA: 'Entrada por devolución de venta',
  SALIDA_DEVOLUCION_COMPRA: 'Salida por devolución a proveedor',
  SALIDA_ANULACION_DEVOLUCION: 'Salida por anulación de devolución',
};

export function movementTypeLabel(code: string): string {
  return MOVEMENT_TYPE_LABELS[code as InventoryMovementType] ?? code;
}

const REFERENCE_DOCUMENT_LABELS: Record<string, string> = {
  COMPRA: 'Compra',
  SALE: 'Venta',
  SALE_CANCEL: 'Anulación de venta',
  CREDIT_NOTE: 'Nota crédito',
  CREDIT_NOTE_CANCEL: 'Anulación de nota crédito',
  DEBIT_NOTE: 'Nota débito',
  AJUSTE_MANUAL: 'Ajuste manual',
  LOTE_INICIAL: 'Lote inicial',
  INITIAL_BALANCE: 'Saldo inicial',
  OPENING_BALANCE: 'Saldo de apertura',
};

export function referenceDocumentLabel(code: string): string {
  return REFERENCE_DOCUMENT_LABELS[code] ?? code;
}
