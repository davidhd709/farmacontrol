import { GoneException } from '@nestjs/common';

/**
 * Ruta retirada (correcciones del cliente, 2026-11-02): todo ingreso o egreso de dinero nace en
 * un recibo de caja o un comprobante de egreso. Responde 410 con la ruta que la reemplaza en
 * lugar de fallar en silencio; los registros históricos siguen consultables.
 */
export function retiredRoute(route: string, replacement: string): never {
  throw new GoneException({
    statusCode: 410,
    error: 'Gone',
    message: `La ruta ${route} fue retirada. ${replacement}`,
  });
}

export const CASH_RECEIPT_REPLACEMENT =
  'Registre el ingreso con un recibo de caja: POST /api/v1/treasury/cash-receipts.';
export const DISBURSEMENT_REPLACEMENT =
  'Registre el egreso con un comprobante de egreso: POST /api/v1/treasury/disbursements.';
export const VOUCHER_REPLACEMENT =
  'Registre el dinero con un recibo de caja (POST /api/v1/treasury/cash-receipts) o un comprobante de egreso (POST /api/v1/treasury/disbursements).';
