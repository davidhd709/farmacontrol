/** Convert decimal monetary input to integer cents, without binary decimal multiplication. */
export function toCents(value: string | number): number {
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error('Importe monetario inválido.');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const cents =
    Number(whole) * 100 +
    Number((fraction + '00').slice(0, 2)) +
    (Number(fraction[2] || 0) >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(cents)) throw new Error('Importe monetario fuera de rango.');
  return negative ? -cents : cents;
}

export const fromCents = (cents: number): number => cents / 100;
export const formatMoney = (cents: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(fromCents(cents));

export function lineAmounts(
  quantity: number,
  unitPriceCents: number,
  discountCents: number,
  taxRate: number,
) {
  const subtotal = Math.max(0, quantity * unitPriceCents - discountCents);
  const taxAmount = Math.round((subtotal * toCents(taxRate)) / 10_000);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}
