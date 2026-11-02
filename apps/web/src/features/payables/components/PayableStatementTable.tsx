import {
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { AgingBreakdownDto, AgingBucket, PayableStatementItemDto } from '@farmacia/contracts';

export const AGING_LABELS: Record<AgingBucket, string> = {
  CORRIENTE: 'Corriente (hasta 30 días)',
  DIAS_31_60: '60 días',
  DIAS_61_90: '90 días',
  MAS_90: 'Más de 90 días',
};

export const DOCUMENT_TYPE_LABELS: Record<PayableStatementItemDto['documentType'], string> = {
  FACTURA_COMPRA: 'Factura de compra',
  CAUSACION_GASTO: 'Causación de gasto',
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
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' },
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

/** Facturas de compra y causaciones con su saldo y su edad. */
export function PayableStatementTable({
  items,
  showSupplier = false,
  actions,
}: {
  items: PayableStatementItemDto[];
  showSupplier?: boolean;
  actions?: (item: PayableStatementItemDto) => React.ReactNode;
}) {
  if (!items.length) {
    return (
      <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        No hay documentos para la consulta.
      </Typography>
    );
  }
  return (
    <TableContainer>
      <Table size="small" aria-label="Estado de cuenta de cuentas por pagar">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Documento</TableCell>
            {showSupplier && <TableCell sx={{ fontWeight: 700 }}>Proveedor</TableCell>}
            <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Vence</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Edad</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Total
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Pagado
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Saldo
            </TableCell>
            {actions && <TableCell />}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.documentType}-${item.documentId}`} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {item.documentNumber ?? '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {DOCUMENT_TYPE_LABELS[item.documentType]}
                  {item.documentType === 'CAUSACION_GASTO' ? ` · ${item.description}` : ''}
                </Typography>
              </TableCell>
              {showSupplier && <TableCell>{item.supplierName ?? '—'}</TableCell>}
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.documentDate}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.dueDate ?? '—'}</TableCell>
              <TableCell>
                {Number(item.balance) > 0 ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    color={item.agingBucket === 'CORRIENTE' ? 'default' : 'warning'}
                    label={AGING_LABELS[item.agingBucket]}
                  />
                ) : (
                  <Chip size="small" variant="outlined" color="success" label="Saldada" />
                )}
              </TableCell>
              <TableCell align="right">{money(item.totalAmount)}</TableCell>
              <TableCell align="right">{money(item.amountPaid)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                {money(item.balance)}
              </TableCell>
              {actions && <TableCell align="right">{actions(item)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
