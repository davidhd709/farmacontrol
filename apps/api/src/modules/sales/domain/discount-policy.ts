import { lineGrossCents, moneyToCents, quantityToHundredths } from './sale-money';

/**
 * AUD-011: rebaja máxima que un usuario sin autorización especial puede aplicar a una
 * línea, sumando descuento y precio por debajo de la lista. Valor definido por la
 * farmacia el 7 oct 2026; la fase 3 lo traslada a la configuración de la empresa.
 */
export const MAX_DISCOUNT_PCT_WITHOUT_AUTHORIZATION = 5;

export class SaleDiscountNotAuthorizedException extends Error {
  constructor(productName: string, maxPct: number) {
    super(
      `La rebaja sobre "${productName}" supera el ${maxPct} % permitido sin autorización. Solicite a un supervisor o administrador que registre la venta.`,
    );
    this.name = 'SaleDiscountNotAuthorizedException';
  }
}

/**
 * Indica si la línea rebaja el valor de lista más allá del porcentaje permitido.
 * Un precio por encima de la lista no cuenta como rebaja.
 */
export function exceedsDiscountLimit(params: {
  quantityCommercial: number;
  listUnitPrice: number;
  chargedUnitPrice: number;
  discount: number;
  maxPct: number;
}): boolean {
  const qty = quantityToHundredths(params.quantityCommercial, 'La cantidad vendida');
  const listGross = lineGrossCents(qty, moneyToCents(params.listUnitPrice, 'El precio de lista'));
  const chargedGross = lineGrossCents(
    qty,
    moneyToCents(params.chargedUnitPrice, 'El precio unitario'),
  );
  const net = chargedGross - moneyToCents(params.discount, 'El descuento');
  const reduction = listGross - net;
  if (reduction <= 0n) return false;
  // reduction / listGross > maxPct / 100, comparado sin división (maxPct en centésimas)
  const maxPctHundredths = BigInt(Math.round(params.maxPct * 100));
  return reduction * 10000n > listGross * maxPctHundredths;
}
