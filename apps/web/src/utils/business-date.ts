/** Zona horaria del negocio (Colombia, sin horario de verano). */
const BUSINESS_TIME_ZONE = 'America/Bogota';
const BUSINESS_UTC_OFFSET = '-05:00';

/** Fecha calendario actual en la zona del negocio, como YYYY-MM-DD. */
export function businessToday(now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Suma días a una fecha calendario YYYY-MM-DD sin depender de la zona del equipo. */
export function addDaysToDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Primer instante del día de negocio, como ISO 8601 con desfase de Bogotá. */
export function businessDayStart(date: string): string {
  return `${date}T00:00:00.000${BUSINESS_UTC_OFFSET}`;
}

/** Último instante del día de negocio, como ISO 8601 con desfase de Bogotá. */
export function businessDayEnd(date: string): string {
  return `${date}T23:59:59.999${BUSINESS_UTC_OFFSET}`;
}

/** Año calendario actual en la zona del negocio. */
export function businessYear(now: Date = new Date()): number {
  return Number(businessToday(now).slice(0, 4));
}

/**
 * Primer y último día del mes de una fecha calendario, desplazado `offset` meses
 * (0 = el mismo mes, -1 = el anterior). No depende de la zona del equipo.
 */
export function calendarMonthBounds(day: string, offset = 0): { from: string; to: string } {
  const [year, month] = day.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const last = new Date(Date.UTC(year, month + offset, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}
