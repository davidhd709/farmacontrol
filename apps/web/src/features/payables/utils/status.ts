import type { PayableStatus } from '@farmacia/contracts';
// ============================================================
// Status chips
// ============================================================

export const statusConfig: Record<
  PayableStatus,
  { label: string; color: 'warning' | 'success' | 'error' | 'default' }
> = {
  PENDIENTE: { label: 'Pendiente', color: 'warning' },
  PAGADA: { label: 'Pagada', color: 'success' },
  ANULADA: { label: 'Anulada', color: 'error' },
};

export const isOverdue = (dueDate: string, status: PayableStatus) =>
  status === 'PENDIENTE' && new Date(dueDate) < new Date();
