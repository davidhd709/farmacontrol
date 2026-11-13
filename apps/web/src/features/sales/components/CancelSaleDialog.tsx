import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';
import type { SaleDto } from '@farmacia/contracts';
import { cancelSale } from '../api/sales.api';
import { formatCop } from '../../../utils/money';

const MIN_REASON = 5;

/**
 * Anulación de una venta con motivo obligatorio. Muestra el efecto antes de confirmar, bloquea el
 * doble envío y conserva el motivo escrito si el servidor rechaza la anulación.
 */
export function CancelSaleDialog({
  sale,
  onClose,
  onCancelled,
}: {
  sale: SaleDto | null;
  onClose: () => void;
  onCancelled: (sale: SaleDto) => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sale) {
      setReason('');
      setError(null);
    }
  }, [sale]);

  const confirm = async () => {
    if (!sale || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const cancelled = await cancelSale(sale.id, reason.trim());
      onCancelled(cancelled);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No fue posible anular la venta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={Boolean(sale)}
      onClose={() => !submitting && onClose()}
      maxWidth="sm"
      fullWidth
      data-testid="cancel-sale-dialog"
    >
      <DialogTitle sx={{ color: 'error.main' }}>Anular venta {sale?.invoiceNumber}</DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Las unidades vuelven a sus lotes de origen, el dinero recibido se registra como salida de
          caja o banco y la venta queda anulada en el historial. No se puede deshacer.
        </Alert>
        <DialogContentText sx={{ mb: 2 }}>
          Venta <strong>{sale?.invoiceNumber}</strong> por{' '}
          <strong>{sale && formatCop(sale.total)}</strong>
          {sale?.customerName ? ` a ${sale.customerName}` : ''}.
        </DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert">
            {error}
          </Alert>
        )}
        <TextField
          label="Motivo de la anulación"
          required
          multiline
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helperText={`Mínimo ${MIN_REASON} caracteres; queda en la auditoría.`}
          disabled={submitting}
          autoFocus
          data-testid="cancel-reason-input"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting} color="inherit">
          Volver
        </Button>
        <Button
          onClick={() => void confirm()}
          disabled={submitting || reason.trim().length < MIN_REASON}
          color="error"
          variant="contained"
          data-testid="confirm-cancel-sale-btn"
          startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {submitting ? 'Anulando…' : 'Anular venta'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
