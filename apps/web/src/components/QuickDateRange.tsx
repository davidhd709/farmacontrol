import { Button, Stack } from '@mui/material';
import { businessToday, calendarMonthBounds } from '../utils/business-date';

export type QuickRange = 'today' | 'this_month' | 'last_month' | 'ytd';

/**
 * YYYY-MM-DD del instante en Bogotá, sin importar la zona del equipo ni la UTC de toISOString.
 * Para meses y años se usa calendarMonthBounds, no fechas construidas con la hora local.
 */
export function localIsoDate(date: Date): string {
  return businessToday(date);
}

/** Rango de fechas de un atajo, en días de Bogotá ("Hoy" no salta al día siguiente desde las 7 p. m.). */
export function quickRange(range: QuickRange, now: Date = new Date()): { from: string; to: string } {
  const today = businessToday(now);
  switch (range) {
    case 'today':
      return { from: today, to: today };
    case 'this_month':
      return { from: calendarMonthBounds(today).from, to: today };
    case 'last_month':
      return calendarMonthBounds(today, -1);
    case 'ytd':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

const LABELS: Array<[QuickRange, string]> = [
  ['today', 'Hoy'],
  ['this_month', 'Este mes'],
  ['last_month', 'Mes anterior'],
  ['ytd', 'Año a la fecha'],
];

/** Atajos de fecha comunes a los reportes (acuerdo del 4 de octubre); el rango personalizado sigue en los campos Desde/Hasta. */
export function QuickDateRange({ onSelect }: { onSelect: (range: { from: string; to: string }) => void }) {
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }} role="group" aria-label="Rangos rápidos de fecha">
      {LABELS.map(([range, label]) => (
        <Button key={range} size="small" variant="outlined" onClick={() => onSelect(quickRange(range))}>
          {label}
        </Button>
      ))}
    </Stack>
  );
}
