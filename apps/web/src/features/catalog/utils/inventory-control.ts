import type { InventoryControlMode } from '@farmacia/contracts';

/** Etiqueta y explicación de cada modo de control de inventario (ADR-006, F4). */
export const INVENTORY_CONTROL_MODE_INFO: Record<
  InventoryControlMode,
  { label: string; description: string }
> = {
  SERVICE: {
    label: 'Servicio',
    description: 'No maneja existencias: la venta no descuenta inventario ni registra costo.',
  },
  SIMPLE: {
    label: 'Inventario simple',
    description: 'Un saldo por ubicación, sin lote ni vencimiento. Sale por orden de entrada.',
  },
  LOT: {
    label: 'Por lote',
    description: 'Cada recepción indica el lote, sin vencimiento. Sale por orden de entrada.',
  },
  LOT_EXPIRY: {
    label: 'Lote y vencimiento (FEFO)',
    description:
      'Lote y vencimiento obligatorios. Sale primero lo que vence antes; lo vencido no se vende.',
  },
  SERIAL: {
    label: 'Por serie',
    description: 'Cada unidad tiene su número de serie y en la venta se elige la serie entregada.',
  },
};

export function inventoryControlModeLabel(mode: InventoryControlMode): string {
  return INVENTORY_CONTROL_MODE_INFO[mode]?.label ?? mode;
}

/** Texto para una existencia sin número de lote (saldo de inventario simple). */
export function lotNumberLabel(lotNumber: string | null | undefined): string {
  return lotNumber ?? 'Sin lote';
}

/** Texto para una existencia sin fecha de vencimiento. */
export function expirationDateLabel(expirationDate: string | null | undefined): string {
  return expirationDate ?? 'No vence';
}
