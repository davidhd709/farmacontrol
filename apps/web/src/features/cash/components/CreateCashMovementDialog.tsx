import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  Divider,
} from '@mui/material';
import type {
  CashMovementType,
  CreateCashMovementPayload,
} from '@farmacia/contracts';
import { createCashMovement } from '../api/cash.api';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

interface CreateCashMovementDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (isIncome: boolean, amount: number) => void;
  currentBalance: number;
}

export const CreateCashMovementDialog: React.FC<CreateCashMovementDialogProps> = ({
  open,
  onClose,
  onSuccess,
  currentBalance,
}) => {
  const [movementType, setMovementType] = useState<CashMovementType>('INGRESO_MANUAL');
  const [amountStr, setAmountStr] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] = useState<CreateCashMovementPayload | null>(null);

  const amountNum = parseFloat(amountStr) || 0;
  const isIncome = movementType === 'INGRESO_MANUAL';

  const projectedBalance = isIncome
    ? currentBalance + amountNum
    : currentBalance - amountNum;

  const isInsufficient = !isIncome && amountNum > currentBalance;

  const handleReset = () => {
    setMovementType('INGRESO_MANUAL');
    setAmountStr('');
    setReason('');
    setErrorMsg(null);
    setLoading(false);
    setPendingPayload(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (amountNum <= 0) {
      setErrorMsg('El monto debe ser un valor positivo mayor a cero.');
      return;
    }

    if (!reason.trim()) {
      setErrorMsg('El motivo o justificación del movimiento es obligatorio.');
      return;
    }

    if (isInsufficient) {
      setErrorMsg(
        `Saldo insuficiente en caja física. Saldo actual: $${currentBalance.toLocaleString('es-CO')}, Egreso solicitado: $${amountNum.toLocaleString('es-CO')}`
      );
      return;
    }

    setPendingPayload({
      movementType,
      amount: amountNum,
      paymentMethod: 'EFECTIVO',
      reason: reason.trim(),
    });
  };

  const handleConfirmMovement = async () => {
    if (!pendingPayload) return;
    try {
      setLoading(true);
      await createCashMovement(pendingPayload);
      const savedIncome = isIncome;
      const savedAmount = amountNum;
      setPendingPayload(null);
      handleClose();
      onSuccess(savedIncome, savedAmount);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al registrar el movimiento de caja');
      setPendingPayload(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth aria-labelledby="cash-movement-title">
      <form onSubmit={handleSubmit}>
        <DialogTitle id="cash-movement-title" sx={{ fontWeight: 600 }}>
          Registrar Movimiento de Caja
        </DialogTitle>
        <DialogContent dividers>
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}

          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Tipo de Operación
            </Typography>
            <RadioGroup
              row
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as CashMovementType)}
            >
              <FormControlLabel
                value="INGRESO_MANUAL"
                control={<Radio color="success" />}
                label={
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                    + Ingreso Manual (Entrada)
                  </Typography>
                }
              />
              <FormControlLabel
                value="EGRESO_MANUAL"
                control={<Radio color="error" />}
                label={
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                    - Egreso Manual (Salida)
                  </Typography>
                }
              />
            </RadioGroup>
          </Box>

          <Alert severity="info" sx={{ mb: 2 }}>
            Caja registra solo efectivo físico. Las transferencias se registran en Bancos.
          </Alert>
          <Box sx={{ mb: 2 }}>
            <TextField
              label="Monto ($)"
              type="number"
              fullWidth
              required
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              slotProps={{ htmlInput: { min: 0.01, step: '0.01' } }}
              placeholder="Ej: 50000"
              autoFocus
            />

          </Box>

          <TextField
            label="Motivo / Justificación"
            fullWidth
            required
            multiline
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Aporte de cambio inicial para inicio de turno..."
            sx={{ mb: 3 }}
          />

          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Saldo Actual en Caja:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                ${currentBalance.toLocaleString('es-CO')}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color={isIncome ? 'success.main' : 'error.main'}>
                Impacto de la Operación:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: isIncome ? 'success.main' : 'error.main' }}>
                {isIncome ? '+' : '-'}${amountNum.toLocaleString('es-CO')}
              </Typography>
            </Box>

            <Divider sx={{ my: 1 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2">
                Saldo Resultante Proyectado:
              </Typography>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: isInsufficient ? 'error.main' : 'text.primary',
                }}
              >
                ${projectedBalance.toLocaleString('es-CO')}
              </Typography>
            </Box>

            {isInsufficient && (
              <Alert severity="warning" sx={{ mt: 1.5, py: 0.5 }}>
                El egreso supera el saldo actual disponible en caja física.
              </Alert>
            )}
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} disabled={loading} color="inherit">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || isInsufficient || amountNum <= 0 || !reason.trim()}
            color={isIncome ? 'success' : 'error'}
          >
            {loading ? 'Registrando...' : 'Confirmar Movimiento'}
          </Button>
        </DialogActions>
      </form>

      <ConfirmDialog
        open={Boolean(pendingPayload)}
        title={isIncome ? 'Confirmar Ingreso a Caja' : 'Confirmar Egreso de Caja'}
        description={`¿Estás seguro de registrar un ${isIncome ? 'ingreso' : 'egreso'} de $${amountNum.toLocaleString('es-CO')} en la caja física por concepto de "${reason.trim()}"? Saldo proyectado tras la operación: $${projectedBalance.toLocaleString('es-CO')}.`}
        confirmText={isIncome ? 'Confirmar Ingreso' : 'Confirmar Egreso'}
        confirmColor={isIncome ? 'primary' : 'error'}
        isLoading={loading}
        onConfirm={handleConfirmMovement}
        onCancel={() => !loading && setPendingPayload(null)}
      />
    </Dialog>
  );
};
