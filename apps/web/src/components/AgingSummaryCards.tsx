import { Box, Paper, Typography } from '@mui/material';
import type { AgingBreakdownDto, AgingBucket } from '@farmacia/contracts';

/** Rangos de edad comunes a cartera y cuentas por pagar. */
export const AGING_LABELS: Record<AgingBucket, string> = {
  CORRIENTE: 'Corriente (hasta 30 días)',
  DIAS_31_60: '60 días',
  DIAS_61_90: '90 días',
  MAS_90: 'Más de 90 días',
};

const money = (value: string) =>
  `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Totales por edad: Corriente (hasta 30 días), 60 días, 90 días y más de 90. */
export function AgingSummaryCards({ aging }: { aging: AgingBreakdownDto }) {
  const cards: Array<{ label: string; amount: string; count: number }> = [
    { label: 'Total pendiente', amount: aging.totalPending, count: aging.totalCount },
    { label: AGING_LABELS.CORRIENTE, ...aging.current },
    { label: AGING_LABELS.DIAS_31_60, ...aging.days31To60 },
    { label: AGING_LABELS.DIAS_61_90, ...aging.days61To90 },
    { label: AGING_LABELS.MAS_90, ...aging.daysOver90 },
  ];
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 1fr)', md: 'repeat(5, minmax(0, 1fr))' },
        gap: 1.5,
      }}
    >
      {cards.map((card) => (
        <Paper key={card.label} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {card.label}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {money(card.amount)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {card.count} documento(s)
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

