import type { AgingBaseDate, AgingBreakdownDto, AgingBucket } from '@farmacia/contracts';
import { businessDateOf, calendarDate } from './business-date';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fecha desde la que se cuenta la edad según la política de la empresa: vencimiento y, si el
 * documento no tiene, emisión (DUE_DATE_OR_ISSUE, regla vigente), o siempre la emisión
 * (ISSUE_DATE). La emisión se toma como día calendario de Bogotá.
 */
export function agingStartDate(
  base: AgingBaseDate,
  dates: { dueDate: Date | null; issuedAt: Date },
): Date {
  const issueDay = calendarDate(businessDateOf(dates.issuedAt));
  return base === 'ISSUE_DATE' ? issueDay : (dates.dueDate ?? issueDay);
}

/** Días vencidos a la fecha de corte; negativo si todavía no vence. */
export function daysOverdue(dueDate: Date, today: Date): number {
  return Math.floor((today.getTime() - dueDate.getTime()) / DAY_MS);
}

/** Corriente (no vencida o hasta 30 días), 31–60, 61–90 y más de 90 días. */
export function agingBucketOf(days: number): AgingBucket {
  if (days <= 30) return 'CORRIENTE';
  if (days <= 60) return 'DIAS_31_60';
  if (days <= 90) return 'DIAS_61_90';
  return 'MAS_90';
}

const toMoney = (cents: bigint) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;

/** Suma saldos (en centavos, no negativos) por rango de edad. */
export function agingBreakdown(items: Array<{ balanceCents: bigint; bucket: AgingBucket }>): AgingBreakdownDto {
  const sums: Record<AgingBucket, { cents: bigint; count: number }> = {
    CORRIENTE: { cents: 0n, count: 0 },
    DIAS_31_60: { cents: 0n, count: 0 },
    DIAS_61_90: { cents: 0n, count: 0 },
    MAS_90: { cents: 0n, count: 0 },
  };
  let total = 0n;
  let count = 0;
  for (const item of items) {
    if (item.balanceCents <= 0n) continue;
    sums[item.bucket].cents += item.balanceCents;
    sums[item.bucket].count++;
    total += item.balanceCents;
    count++;
  }
  const bucket = (key: AgingBucket) => ({ amount: toMoney(sums[key].cents), count: sums[key].count });
  return {
    current: bucket('CORRIENTE'),
    days31To60: bucket('DIAS_31_60'),
    days61To90: bucket('DIAS_61_90'),
    daysOver90: bucket('MAS_90'),
    totalPending: toMoney(total),
    totalCount: count,
  };
}
