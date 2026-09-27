import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  CircularProgress,
} from '@mui/material';
import type { SalePaymentMethod } from '@farmacia/contracts';

interface PosPaymentDialogProps {
  open: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (paymentMethod: SalePaymentMethod, amountPaid: number, notes?: string) => Promise<void>;
  loading: boolean;
}

export const PosPaymentDialog: React.FC<PosPaymentDialogProps> = ({
  open,
  total,
  onClose,
  onConfirm,
  loading,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('EFECTIVO');
  const [amountPaidStr, setAmountPaidStr] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPaymentMethod('EFECTIVO');
      setAmountPaidStr(String(total));
      setNotes('');
      setErrorMsg(null);
    }
  }, [open, total]);

  const amountPaidNum = Number(amountPaidStr) || 0;
  const changeGiven = paymentMethod === 'EFECTIVO' ? Math.max(0, amountPaidNum - total) : 0;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (paymentMethod === 'EFECTIVO') {
      if (amountPaidNum < total) {
        setErrorMsg(`El monto recibido ($${amountPaidNum.toLocaleString()}) es inferior al total ($${total.toLocaleString()}).`);
        return;
      }
    }

    try {
      await onConfirm(paymentMethod, amountPaidNum, notes.trim() || undefined);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al procesar el pago.');
    }
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleConfirm}>
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Cobro y Liquidación de Venta</DialogTitle>
        <DialogContent dividers>
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}

          <Box sx={{ mb: 2, textAlign: 'center', py: 1.5, bgcolor: 'primary.50', borderRadius: 1.5, border: '1px solid', borderColor: 'primary.200' }}>
            <Typography variant="body2" color="text.secondary">Total a Pagar</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
              ${total.toLocaleString('es-CO')}
            </Typography>
          </Box>

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Medio de Pago</Typography>
          <RadioGroup
            row
            value={paymentMethod}
            onChange={(e) => {
              const val = e.target.value as SalePaymentMethod;
              setPaymentMethod(val);
              if (val !== 'EFECTIVO') {
                setAmountPaidStr(String(total));
              }
            }}
            sx={{ mb: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}
          >
            <FormControlLabel value="EFECTIVO" control={<Radio size="small" />} label="Efectivo" />
            <FormControlLabel value="TRANSFERENCIA" control={<Radio size="small" />} label="Transferencia" />
            <FormControlLabel value="TARJETA_DEBITO" control={<Radio size="small" />} label="T. Débito" />
            <FormControlLabel value="TARJETA_CREDITO" control={<Radio size="small" />} label="T. Crédito" />
          </RadioGroup>

          {paymentMethod === 'EFECTIVO' && (
            <Box sx={{ mb: 2 }}>
              <TextField
                label="Efectivo Recibido *"
                type="number"
                size="small"
                fullWidth
                value={amountPaidStr}
                onChange={(e) => setAmountPaidStr(e.target.value)}
                required
                disabled={loading}
                autoFocus
                slotProps={{ htmlInput: { min: total, step: 'any' } }}
                sx={{ mb: 1.5 }}
              />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1.5, bgcolor: 'background.default', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Cambio / Devuelta:</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: changeGiven > 0 ? 'success.main' : 'text.primary' }}>
                  ${changeGiven.toLocaleString('es-CO')}
                </Typography>
              </Box>
            </Box>
          )}

          <TextField
            label="Notas / Observaciones"
            size="small"
            fullWidth
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={loading}
            placeholder="Ej: Cliente solicitó comprobante detallado"
          />
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={loading} color="inherit">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
            data-testid="confirm-payment-btn"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
            sx={{ fontWeight: 700, px: 3 }}
          >
            {loading ? 'Confirmando venta...' : 'Confirmar Venta'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
