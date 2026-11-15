/**
 * Origen de un asiento en palabras del usuario, compartido por el Libro Diario y su impresión
 * (el código interno, p. ej. EXPENSE, no se muestra).
 */
export interface JournalSourceType {
  label: string;
  color: 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'default';
}

const JOURNAL_SOURCE_TYPES: Record<string, JournalSourceType> = {
  SALE: { label: 'Venta', color: 'success' },
  SALE_CANCEL: { label: 'Anulación de venta', color: 'secondary' },
  CREDIT_NOTE: { label: 'Devolución', color: 'warning' },
  CREDIT_NOTE_CANCEL: { label: 'Anulación de devolución', color: 'secondary' },
  PURCHASE: { label: 'Compra', color: 'primary' },
  DEBIT_NOTE: { label: 'Devolución a proveedor', color: 'primary' },
  RECEIVABLE_PAYMENT: { label: 'Cobro de cartera', color: 'info' },
  PAYABLE_PAYMENT: { label: 'Pago a proveedor', color: 'warning' },
  EXPENSE: { label: 'Causación', color: 'warning' },
  EXPENSE_PAYMENT: { label: 'Pago de causación', color: 'warning' },
  CASH_MOVEMENT: { label: 'Recibo / egreso de caja', color: 'info' },
  BANK_MOVEMENT: { label: 'Recibo / egreso bancario', color: 'info' },
  INVENTORY_ADJUSTMENT: { label: 'Ajuste de inventario', color: 'default' },
  INVENTORY_INITIAL: { label: 'Inventario inicial', color: 'default' },
  LOT_INITIAL: { label: 'Inventario inicial', color: 'default' },
  METHOD_CHANGE: { label: 'Cambio de método de costeo', color: 'default' },
  OPENING_BALANCE: { label: 'Saldos iniciales', color: 'default' },
  AUTO_OPENING: { label: 'Apertura', color: 'default' },
  FISCAL_CLOSING: { label: 'Cierre mensual', color: 'default' },
  ANNUAL_CLOSING: { label: 'Cierre anual', color: 'default' },
  REVERSAL: { label: 'Anulación', color: 'secondary' },
  MANUAL_NOTE: { label: 'Nota contable', color: 'default' },
};

export const journalSourceType = (sourceType: string): JournalSourceType =>
  JOURNAL_SOURCE_TYPES[sourceType] ?? { label: 'Otro documento', color: 'default' };
