/** Zona horaria del negocio (Colombia). */
export const BUSINESS_TIME_ZONE = 'America/Bogota';

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

/** Fecha calendario de Bogotá correspondiente a un instante. */
export const businessDateOf = businessToday;

/** Año y mes de un instante en Bogotá. */
export function businessYearMonth(instant: Date = new Date()): { year: number; month: number } {
  const [year, month] = businessDateOf(instant).split('-').map(Number);
  return { year, month };
}

/** Suma días a una fecha calendario, sin depender de la zona del servidor. */
export function addCalendarDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Inicio de un filtro sobre columnas timestamptz. Un día calendario (YYYY-MM-DD) se
 * interpreta como el comienzo de ese día en Bogotá; un instante ISO completo se respeta.
 */
export function businessDayStart(value: string): Date {
  // Colombia mantiene UTC-05:00 sin horario de verano.
  return CALENDAR_DAY.test(value) ? new Date(`${value}T05:00:00.000Z`) : new Date(value);
}

/** Fin de un filtro sobre timestamptz: último instante del día de Bogotá, o el instante dado. */
export function businessDayEnd(value: string): Date {
  return CALENDAR_DAY.test(value)
    ? new Date(businessDayStart(addCalendarDays(value, 1)).getTime() - 1)
    : new Date(value);
}

/** Representación Prisma de una fecha calendario (@db.Date). */
export function calendarDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
