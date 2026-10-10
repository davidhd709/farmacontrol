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
