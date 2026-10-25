import { Stack, TextField } from '@mui/material';

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

export function monthStart(today = new Date()): string {
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 8) + '01';
}

export function localToday(today = new Date()): string {
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}
