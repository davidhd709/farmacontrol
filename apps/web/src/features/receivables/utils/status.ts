import { isReceivableStatus, type ReceivableStatus } from '@farmacia/contracts';
// ============================================================
// Status chips
// ============================================================

export const statusConfig: Record<
  ReceivableStatus,
  { label: string; color: 'warning' | 'success' | 'error' | 'default' }
> = {
  PENDIENTE: { label: 'Pendiente', color: 'warning' },
  PAGADA: { label: 'Pagada', color: 'success' },
  ANULADA: { label: 'Anulada', color: 'error' },
};

/**
 * FARM-AUD-003: un estado fuera del contrato no rompe la pantalla ni se presenta como pagado o
 * anulado; se muestra tal cual para que la inconsistencia sea visible.
 */
export const getStatusDisplay = (status: string) =>
  isReceivableStatus(status)
    ? { ...statusConfig[status], recognized: true }
    : { label: `Estado no reconocido: ${status}`, color: 'default' as const, recognized: false };

export const isOverdue = (dueDate: string, status: ReceivableStatus) =>
  status === 'PENDIENTE' && new Date(dueDate) < new Date();
