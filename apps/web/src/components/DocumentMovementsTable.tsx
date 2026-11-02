import {
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { DocumentMovementDto, DocumentMovementType } from '@farmacia/contracts';

const TYPE_LABELS: Record<DocumentMovementType, string> = {
  CARGO: 'Factura',
  ABONO: 'Abono',
  REVERSION_ABONO: 'Reversión de abono',
  NOTA_CREDITO: 'Nota crédito',
  NOTA_DEBITO: 'Nota débito',
  ANULACION: 'Anulación',
};

export const formatMoney = (value: string) =>
  `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Movimientos de una factura (cartera o cuentas por pagar) con el saldo después de cada uno.
 * El sentido se muestra en columnas separadas y con texto, no solo con color.
 */
export function DocumentMovementsTable({
  movements,
  creditLabel = 'Abono',
  onReverse,
}: {
  movements: DocumentMovementDto[];
  creditLabel?: string;
  /** Revertir un abono o pago vigente; sin él la tabla es de solo lectura */
  onReverse?: (movement: DocumentMovementDto) => void;
}) {
  if (!movements.length) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        La factura no tiene movimientos.
      </Typography>
    );
  }
  return (
    <TableContainer>
      <Table size="small" aria-label="Movimientos de la factura">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Movimiento</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Documento</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Detalle</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Cargo
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              {creditLabel}
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Saldo
            </TableCell>
            {onReverse && <TableCell />}
          </TableRow>
        </TableHead>
        <TableBody>
          {movements.map((movement, index) => (
            <TableRow key={`${movement.type}-${movement.date}-${index}`}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {new Date(movement.date).toLocaleDateString('es-CO')}
              </TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" label={TYPE_LABELS[movement.type]} />
              </TableCell>
              <TableCell sx={{ fontFamily: 'monospace' }}>
                {movement.documentNumber ?? '—'}
              </TableCell>
              <TableCell>
                {movement.description}
                {movement.paymentMethod && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {movement.paymentMethod === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'}
                  </Typography>
                )}
              </TableCell>
              <TableCell align="right">
                {Number(movement.charge) > 0 ? formatMoney(movement.charge) : ''}
              </TableCell>
              <TableCell align="right">
                {Number(movement.credit) > 0 ? formatMoney(movement.credit) : ''}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                {formatMoney(movement.balance)}
              </TableCell>
              {onReverse && (
                <TableCell align="right">
                  {movement.type === 'ABONO' && movement.paymentId && !movement.isReversed && (
                    <Button size="small" color="error" onClick={() => onReverse(movement)}>
                      Revertir
                    </Button>
                  )}
                  {movement.type === 'ABONO' && movement.isReversed && (
                    <Typography variant="caption" color="text.secondary">
                      Revertido
                    </Typography>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
