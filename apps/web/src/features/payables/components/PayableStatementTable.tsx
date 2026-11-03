import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { PayableStatementItemDto } from '@farmacia/contracts';
import { AGING_LABELS } from '../../../components/AgingSummaryCards';
import { formatDate } from '../../../utils/date-format';

export const DOCUMENT_TYPE_LABELS: Record<PayableStatementItemDto['documentType'], string> = {
  FACTURA_COMPRA: 'Factura de compra',
  CAUSACION_GASTO: 'Causación de gasto',
};

const money = (value: string) =>
  `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(item.documentDate)}</TableCell>
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
