import type { SalePaymentMethod, SaleStatus } from '@farmacia/contracts';
import type { StatusTone } from '../../components/StatusChip';

/** Etiquetas en español; los valores internos del API no cambian. */
export const SALE_STATUS_LABELS: Record<SaleStatus, { label: string; tone: StatusTone }> = {
  COMPLETED: { label: 'Completada', tone: 'success' },
  CANCELLED: { label: 'Anulada', tone: 'error' },
};

export const SALE_PAYMENT_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA_DEBITO: 'Tarjeta débito',
  TARJETA_CREDITO: 'Tarjeta crédito',
  CREDITO: 'Crédito',
};

export const paymentMethodLabel = (method: string) =>
  SALE_PAYMENT_METHOD_LABELS[method as SalePaymentMethod] ?? method;
