import { Button } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type { SortOrder } from '@farmacia/contracts';

/** Alterna el orden por fecha de un listado: más nuevo primero ↔ más viejo primero. */
export function SortByDateButton({
  value,
  onChange,
}: {
  value: SortOrder;
  onChange: (next: SortOrder) => void;
}) {
  const ascending = value === 'asc';
  return (
    <Button
      size="small"
      variant="outlined"
      color="inherit"
      onClick={() => onChange(ascending ? 'desc' : 'asc')}
      startIcon={ascending ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />}
      aria-label={`Orden por fecha: ${ascending ? 'más viejo primero' : 'más nuevo primero'}. Cambiar orden`}
      sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
    >
      {ascending ? 'Más viejo primero' : 'Más nuevo primero'}
    </Button>
  );
}
