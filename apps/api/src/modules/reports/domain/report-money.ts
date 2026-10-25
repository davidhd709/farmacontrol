/** Decimal de persistencia a centavos exactos, sin pasar por coma flotante. */
export function moneyToCents(value: { toString(): string }): bigint {
  const text = value.toString();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Importe monetario inválido: ${text}`);
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -cents : cents;
}

/** La conversión a number se reserva para la frontera del DTO. */
export function centsToNumber(cents: bigint): number {
  return Number(cents) / 100;
}
