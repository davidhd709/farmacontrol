import { Button, Stack } from '@mui/material';

export type QuickRange = 'today' | 'this_month' | 'last_month' | 'ytd';

/** YYYY-MM-DD con la fecha local del equipo (Colombia), no la UTC de toISOString. */
export function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Rango de fechas de un atajo. Antes se usaba toISOString y "Hoy" saltaba al día siguiente desde las 7 p. m. */
export function quickRange(range: QuickRange, now: Date = new Date()): { from: string; to: string } {
  const today = localIsoDate(now);
  switch (range) {
    case 'today':
      return { from: today, to: today };
    case 'this_month':
      return { from: localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case 'last_month':
      return {
        from: localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'ytd':
      return { from: localIsoDate(new Date(now.getFullYear(), 0, 1)), to: today };
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
