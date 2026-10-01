import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { BankAccountDto, BankMovementType, CreateBankMovementDto } from '@farmacia/contracts';

interface BankMovementDialogProps {
  open: boolean;
  onClose: () => void;
  account: BankAccountDto | null;
  onSubmit: (data: CreateBankMovementDto) => Promise<void>;
  isSubmitting?: boolean;
}

const MOVEMENT_TYPE_LABELS: Record<BankMovementType, { label: string; isOutflow: boolean }> = {
  DEPOSIT: { label: 'Consignación / Depósito (+)', isOutflow: false },
  TRANSFER_IN: { label: 'Transferencia Recibida (+)', isOutflow: false },
  WITHDRAWAL: { label: 'Retiro en Efectivo (-)', isOutflow: true },
  TRANSFER_OUT: { label: 'Transferencia Enviada / Pago (-)', isOutflow: true },
  FEE: { label: 'Comisión / Gasto Bancario (-)', isOutflow: true },
  ADJUSTMENT: { label: 'Ajuste Contable (+)', isOutflow: false },
};

export const BankMovementDialog: React.FC<BankMovementDialogProps> = ({
  open,
  onClose,
  account,
  onSubmit,
  isSubmitting = false,
}) => {
  const [movementType, setMovementType] = useState<BankMovementType>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMovementType('DEPOSIT');
    setAmount('');
    setConcept('');
    setExternalReference('');
    setErrorMessage(null);
  }, [open, account]);

  if (!account) return null;

  const currentBal = parseFloat(account.currentBalance || '0');
  const parsedAmount = parseFloat(amount || '0');
  const isDebit = MOVEMENT_TYPE_LABELS[movementType].isOutflow;
  const willExceed = isDebit && parsedAmount > currentBal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!amount.trim() || parsedAmount <= 0) {
      setErrorMessage('El importe debe ser mayor que cero.');
      return;
    }

    if (willExceed) {
      setErrorMessage(
        `Fondos insuficientes: el movimiento ($${parsedAmount.toLocaleString('es-CO')}) excede el saldo actual de la cuenta ($${currentBal.toLocaleString('es-CO')}).`,
      );
      return;
    }

    if (!concept.trim()) {
      setErrorMessage('El concepto o justificación del movimiento es obligatorio.');
      return;
    }

    try {
      await onSubmit({
        movementType,
        amount: amount.trim(),
        concept: concept.trim(),
        externalReference: externalReference.trim() || null,
      });
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Error al registrar el movimiento.');
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 600 }}>
          Registrar Movimiento en {account.bankName}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

            <Alert severity="info" sx={{ py: 0.5 }}>
              <Typography variant="body2">
                <strong>Cuenta:</strong> {account.name} ({account.accountNumber})
                <br />
                <strong>Saldo disponible:</strong> ${currentBal.toLocaleString('es-CO')} COP
              </Typography>
            </Alert>

            <FormControl fullWidth required>
              <InputLabel id="movement-type-label">Tipo de Movimiento</InputLabel>
              <Select
                labelId="movement-type-label"
                value={movementType}
                label="Tipo de Movimiento"
                onChange={(e) => setMovementType(e.target.value as BankMovementType)}
                inputProps={{ 'data-testid': 'movement-type-select' }}
              >
                {(Object.keys(MOVEMENT_TYPE_LABELS) as BankMovementType[]).map((type) => (
                  <MenuItem key={type} value={type}>
                    {MOVEMENT_TYPE_LABELS[type].label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Importe (COP)"
              type="number"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              slotProps={{
                htmlInput: { step: '0.01', min: '0.01', 'data-testid': 'movement-amount-input' },
              }}
              helperText={
                isDebit
                  ? 'Este importe reducirá el saldo de la cuenta bancaria.'
                  : 'Este importe incrementará el saldo de la cuenta bancaria.'
              }
              error={willExceed}
            />

            <TextField
              label="Concepto / Motivo del Movimiento"
              required
              multiline
              rows={2}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej. Consignación de ventas del fin de semana, pago de servicio de internet..."
              slotProps={{ htmlInput: { 'data-testid': 'movement-concept-input' } }}
            />

            <TextField
              label="Referencia Externa / Comprobante (Opcional)"
              value={externalReference}
              onChange={(e) => setExternalReference(e.target.value)}
              placeholder="Ej. N° de aprobación, voucher, ID transferencia..."
              slotProps={{ htmlInput: { 'data-testid': 'movement-reference-input' } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || willExceed}
            data-testid="submit-movement-btn"
          >
            {isSubmitting ? 'Procesando...' : 'Confirmar Movimiento'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
