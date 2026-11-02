import { Stack, TextField } from '@mui/material';
import { businessToday } from '../../../utils/business-date';

/** Rango de fechas (YYYY-MM-DD) de un reporte. */
export function PeriodFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField
        type="date"
        label="Desde"
        value={from}
        onChange={(e) => onChange({ from: e.target.value, to })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        type="date"
        label="Hasta"
        value={to}
        onChange={(e) => onChange({ from, to: e.target.value })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </Stack>
  );
}

/** Primer día del mes en curso en Bogotá. */
export function monthStart(today = new Date()): string {
  return `${businessToday(today).slice(0, 7)}-01`;
}

/** Fecha de hoy en Bogotá. */
export function localToday(today = new Date()): string {
  return businessToday(today);
}
