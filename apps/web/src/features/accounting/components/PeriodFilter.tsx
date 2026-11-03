import { Stack } from '@mui/material';
import { businessToday } from '../../../utils/business-date';
import { DateField } from '../../../components/DateField';

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
      <DateField label="Desde" value={from} onChange={(value) => onChange({ from: value, to })} />
      <DateField label="Hasta" value={to} onChange={(value) => onChange({ from, to: value })} />
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
