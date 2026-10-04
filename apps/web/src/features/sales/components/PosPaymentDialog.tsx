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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import type { SalePaymentMethod } from '@farmacia/contracts';
import { useBankAccountOptions } from '../../treasury/hooks/useTreasury';

interface PosPaymentDialogProps {
  open: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (paymentMethod: SalePaymentMethod, amountPaid: number, notes?: string, bankAccountId?: string) => Promise<void>;
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
  const [bankAccountId, setBankAccountId] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bankAccounts = useBankAccountOptions(open && paymentMethod === 'TRANSFERENCIA');

  useEffect(() => {
    if (open) {
      setPaymentMethod('EFECTIVO');
      setAmountPaidStr(String(total));
      setNotes('');
      setBankAccountId('');
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
    if (paymentMethod === 'TRANSFERENCIA' && !bankAccountId) {
      setErrorMsg('Selecciona la cuenta bancaria que recibió la transferencia.');
      return;
    }

    try {
      await onConfirm(paymentMethod, amountPaidNum, notes.trim() || undefined, bankAccountId || undefined);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al procesar el pago.');
    }
  };

  const commonDenominations = [5000, 10000, 20000, 50000, 100000];
  const quickDenominations = commonDenominations.filter((d) => d > total).slice(0, 3);
  if (quickDenominations.length === 0 && total > 0) {
    const nextCeil = Math.ceil(total / 50000) * 50000;
    if (nextCeil > total) quickDenominations.push(nextCeil);
  }

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2.5,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          },
        },
      }}
    >
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
          </RadioGroup>

          {paymentMethod === 'TRANSFERENCIA' && (
            <FormControl fullWidth size="small" sx={{ mb: 2 }} required error={bankAccounts.isError}>
              <InputLabel id="sale-bank-account-label">Cuenta que recibe</InputLabel>
              <Select
                labelId="sale-bank-account-label"
                label="Cuenta que recibe"
                value={bankAccountId}
                onChange={(event) => setBankAccountId(event.target.value)}
                disabled={loading || bankAccounts.isPending || bankAccounts.isError}
              >
                {(bankAccounts.data ?? []).map((account) => (
                  <MenuItem key={account.id} value={account.id}>{account.name} · {account.bankName}{account.accountNumberLast4 ? ` ···${account.accountNumberLast4}` : ''}</MenuItem>
                ))}
              </Select>
              {bankAccounts.isError && <Alert severity="error">No se pudieron consultar las cuentas bancarias.</Alert>}
            </FormControl>
          )}

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
                sx={{ mb: 1 }}
              />

              {/* Sugerencias de pago rápido con billetes comunes */}
              <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', mb: 1.5, alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.5 }}>
                  Rápido:
                </Typography>
                <Button
                  size="small"
                  variant={amountPaidNum === total ? 'contained' : 'outlined'}
                  onClick={() => setAmountPaidStr(String(total))}
                  sx={{ py: 0.2, px: 0.8, fontSize: '0.75rem', minWidth: 'auto', textTransform: 'none' }}
                >
                  Exacto
                </Button>
                {quickDenominations.map((denom) => (
                  <Button
                    key={denom}
                    size="small"
                    variant={amountPaidNum === denom ? 'contained' : 'outlined'}
                    onClick={() => setAmountPaidStr(String(denom))}
                    sx={{ py: 0.2, px: 0.8, fontSize: '0.75rem', minWidth: 'auto', textTransform: 'none' }}
                  >
                    ${denom.toLocaleString('es-CO')}
                  </Button>
                ))}
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, bgcolor: changeGiven > 0 ? 'success.50' : 'background.default', borderRadius: 1.5, border: 1, borderColor: changeGiven > 0 ? 'success.200' : 'divider' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Cambio / Devuelta:</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: changeGiven > 0 ? 'success.dark' : 'text.primary' }}>
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
          <Button onClick={onClose} disabled={loading} color="inherit" sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
            data-testid="confirm-payment-btn"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
            sx={{
              fontWeight: 700,
              px: 3,
              textTransform: 'none',
              transition: 'transform 0.1s ease, background-color 0.15s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            {loading ? 'Confirmando venta...' : 'Confirmar Venta'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
