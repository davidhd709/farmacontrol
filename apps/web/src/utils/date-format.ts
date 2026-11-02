/** Formato de fechas visibles: dd/mm/aaaa, siempre en la zona del negocio (Bogotá). */
const BUSINESS_TIME_ZONE = 'America/Bogota';
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const dateParts = new Intl.DateTimeFormat('es-CO', {
  timeZone: BUSINESS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const timeParts = new Intl.DateTimeFormat('es-CO', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

function partsOf(formatter: Intl.DateTimeFormat, date: Date) {
  return Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
}

/**
 * dd/mm/aaaa. Una fecha calendario (YYYY-MM-DD) se muestra tal cual, sin pasar por zonas
 * horarias; un instante ISO se convierte al día de Bogotá. Vacío o inválido → "—".
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  if (typeof value === 'string') {
    const day = CALENDAR_DAY.exec(value.slice(0, 10));
    if (day && value.length === 10) return `${day[3]}/${day[2]}/${day[1]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const p = partsOf(dateParts, date);
  return `${p.day}/${p.month}/${p.year}`;
}

/** dd/mm/aaaa hh:mm a. m./p. m. en Bogotá. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDate(date)} ${timeParts.format(date)}`;
}
