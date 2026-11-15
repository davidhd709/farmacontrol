import type { StatusTone } from '../../components/StatusChip';

/** Estados de una compra en español; el API conserva el código (RECEIVED, ...). */
const PURCHASE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  RECEIVED: { label: 'Recibida', tone: 'success' },
  CANCELLED: { label: 'Anulada', tone: 'error' },
};

export function purchaseStatus(code: string): { label: string; tone: StatusTone } {
  return PURCHASE_STATUS[code] ?? { label: code, tone: 'neutral' };
}
