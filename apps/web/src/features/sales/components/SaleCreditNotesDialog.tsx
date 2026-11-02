import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS, type CreditNoteDto, type SaleDto } from '@farmacia/contracts';
import { cancelCreditNote, fetchSaleCreditNotes } from '../api/sales.api';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { formatDateTime } from '../../../utils/date-format';

const REFUND_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CREDITO_CARTERA: 'Cartera',
};

const money = (value: number) =>
  `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Devoluciones (notas crédito) de una venta, con su estado. Una nota confirmada se anula desde
 * aquí: la mercancía vuelve a salir, el reembolso se deshace y se reversa su asiento.
 */
export function SaleCreditNotesDialog({
  sale,
  onClose,
  onCancelled,
}: {
  sale: SaleDto | null;
  onClose: () => void;
  onCancelled: (note: CreditNoteDto) => void;
}) {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [toCancel, setToCancel] = useState<CreditNoteDto | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const notes = useQuery({
    queryKey: ['sale-credit-notes', sale?.id],
    queryFn: () => fetchSaleCreditNotes(sale!.id),
    enabled: Boolean(sale),
  });

  const cancel = useMutation({
    mutationFn: () => cancelCreditNote(toCancel!.id, reason.trim()),
    onSuccess: (note) => {
      setToCancel(null);
      setReason('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['sale-credit-notes', sale?.id] });
      onCancelled(note);
    },
    onError: (err: Error) => setError(err.message || 'No se pudo anular la devolución.'),
  });

  const canCancel = hasPermission(SYSTEM_PERMISSIONS.SALES_CANCEL);

  return (
    <Dialog
      open={Boolean(sale)}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="sale-credit-notes-title"
    >
      <DialogTitle id="sale-credit-notes-title" sx={{ fontWeight: 700 }}>
        Devoluciones de la venta {sale?.invoiceNumber}
      </DialogTitle>
      <DialogContent dividers>
        {notes.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : notes.isError ? (
          <Alert severity="error">No se pudieron cargar las devoluciones.</Alert>
        ) : (notes.data ?? []).length === 0 ? (
          <Typography color="text.secondary">Esta venta no tiene devoluciones.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nota crédito</TableCell>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Reembolso</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(notes.data ?? []).map((note) => (
                  <TableRow key={note.id}>
                    <TableCell sx={{ fontWeight: 600 }}>{note.creditNoteNumber}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(note.createdAt)}
                    </TableCell>
                    <TableCell>{REFUND_LABELS[note.refundMethod] ?? note.refundMethod}</TableCell>
                    <TableCell align="right">{money(note.total)}</TableCell>
                    <TableCell>
                      {note.status === 'ANULADA' ? (
                        <Chip size="small" color="default" variant="outlined" label="Anulada" />
                      ) : (
                        <Chip size="small" color="success" label="Confirmada" />
                      )}
                      {note.status === 'ANULADA' && note.cancellationReason && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          Motivo: {note.cancellationReason}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {canCancel && note.status === 'CONFIRMADA' && (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={() => {
                            setToCancel(note);
                            setReason('');
                            setError(null);
                          }}
                        >
                          Anular
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {toCancel && (
          <Stack spacing={2} sx={{ mt: 3 }}>
            <Alert severity="warning">
              Al anular {toCancel.creditNoteNumber}{' '}
              {toCancel.restock ? 'la mercancía devuelta vuelve a salir del inventario, ' : ''}
              {toCancel.refundMethod === 'CREDITO_CARTERA'
                ? `la factura vuelve a deber ${money(toCancel.total)}`
                : `vuelven a ${toCancel.refundMethod === 'TRANSFERENCIA' ? 'la cuenta bancaria' : 'caja'} ${money(toCancel.total)}`}{' '}
              y se reversa su asiento contable.
            </Alert>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Motivo de la anulación"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              multiline
              minRows={2}
            />
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
              <Button onClick={() => setToCancel(null)} disabled={cancel.isPending}>
                Volver
              </Button>
              <Button
                variant="contained"
                color="error"
                disabled={cancel.isPending || reason.trim().length < 3}
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending ? 'Anulando…' : `Anular ${toCancel.creditNoteNumber}`}
              </Button>
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
