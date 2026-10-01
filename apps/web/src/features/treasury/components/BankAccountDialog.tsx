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
} from '@mui/material';
import type { BankAccountDto, BankAccountType, CreateBankAccountDto, UpdateBankAccountDto } from '@farmacia/contracts';

interface BankAccountDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateBankAccountDto | UpdateBankAccountDto) => Promise<void>;
  accountToEdit?: BankAccountDto | null;
  isSubmitting?: boolean;
}

const COMMON_BANKS = [
  'Bancolombia',
  'Davivienda',
  'Banco de Bogotá',
  'BBVA Colombia',
  'Banco de Occidente',
  'Nequi',
  'Daviplata',
  'Scotiabank Colpatria',
  'Banco Caja Social',
  'Banco Agrario',
];

export const BankAccountDialog: React.FC<BankAccountDialogProps> = ({
  open,
  onClose,
  onSubmit,
  accountToEdit,
  isSubmitting = false,
}) => {
  const isEditing = Boolean(accountToEdit);

  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState<BankAccountType>('AHORROS');
  const [accountNumber, setAccountNumber] = useState('');
  const [name, setName] = useState('');
  const [initialBalance, setInitialBalance] = useState('0.00');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (accountToEdit) {
      setBankName(accountToEdit.bankName);
      setAccountType(accountToEdit.accountType);
      setAccountNumber(accountToEdit.accountNumber);
      setName(accountToEdit.name);
      setInitialBalance(accountToEdit.initialBalance);
      setNotes(accountToEdit.notes ?? '');
      setIsActive(accountToEdit.isActive);
    } else {
      setBankName('');
      setAccountType('AHORROS');
      setAccountNumber('');
      setName('');
      setInitialBalance('0.00');
      setNotes('');
      setIsActive(true);
    }
    setErrorMessage(null);
  }, [accountToEdit, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('El nombre descriptivo de la cuenta es obligatorio.');
      return;
    }

    try {
      if (isEditing) {
        await onSubmit({
          name: name.trim(),
          notes: notes.trim() || null,
          isActive,
        });
      } else {
        if (!bankName.trim()) {
          setErrorMessage('El nombre del banco o entidad es obligatorio.');
          return;
        }
        if (!accountNumber.trim()) {
          setErrorMessage('El número de cuenta es obligatorio.');
          return;
        }
        await onSubmit({
          bankName: bankName.trim(),
          accountType,
          accountNumber: accountNumber.trim(),
          name: name.trim(),
          initialBalance: initialBalance.trim() || '0.00',
          notes: notes.trim() || null,
        });
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Ocurrió un error al procesar la cuenta bancaria.');
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {isEditing ? 'Editar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

            {!isEditing ? (
              <>
                <TextField
                  label="Banco o Entidad Financiera"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Ej. Bancolombia, Nequi..."
                  slotProps={{
                    htmlInput: {
                      list: 'common-banks-list',
                      'data-testid': 'bank-name-input',
                    },
                  }}
                />
                <datalist id="common-banks-list">
                  {COMMON_BANKS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>

                <FormControl fullWidth required>
                  <InputLabel id="account-type-label">Tipo de Cuenta</InputLabel>
                  <Select
                    labelId="account-type-label"
                    value={accountType}
                    label="Tipo de Cuenta"
                    onChange={(e) => setAccountType(e.target.value as BankAccountType)}
                    inputProps={{ 'data-testid': 'account-type-select' }}
                  >
                    <MenuItem value="AHORROS">Cuenta de Ahorros</MenuItem>
                    <MenuItem value="CORRIENTE">Cuenta Corriente</MenuItem>
                    <MenuItem value="DIGITAL">Billetera Digital / Depósito Electrónico</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Número de Cuenta o Celular Asociado"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Ej. 123-456789-01 o 3001234567"
                  slotProps={{ htmlInput: { 'data-testid': 'account-number-input' } }}
                />

                <TextField
                  label="Saldo Inicial (COP)"
                  type="number"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  slotProps={{
                    htmlInput: { step: '0.01', min: '0', 'data-testid': 'initial-balance-input' },
                  }}
                  helperText="Se registrará un movimiento inicial de depósito si el valor es mayor que cero."
                />
              </>
            ) : (
              <TextField
                label="Banco y Número de Cuenta"
                value={`${bankName} — ${accountType} (${accountNumber})`}
                disabled
              />
            )}

            <TextField
              label="Nombre Descriptivo de la Cuenta"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Cuenta Recaudos POS o Cuenta Nómina"
              slotProps={{ htmlInput: { 'data-testid': 'account-name-input' } }}
            />

            {isEditing && (
              <FormControl fullWidth>
                <InputLabel id="account-status-label">Estado de la Cuenta</InputLabel>
                <Select
                  labelId="account-status-label"
                  value={isActive ? 'true' : 'false'}
                  label="Estado de la Cuenta"
                  onChange={(e) => setIsActive(e.target.value === 'true')}
                >
                  <MenuItem value="true">Activa</MenuItem>
                  <MenuItem value="false">Inactiva (Deshabilitada para movimientos)</MenuItem>
                </Select>
              </FormControl>
            )}

            <TextField
              label="Notas u Observaciones"
              multiline
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles sobre uso, firma autorizada o sucursal..."
              slotProps={{ htmlInput: { 'data-testid': 'notes-input' } }}
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
            disabled={isSubmitting}
            data-testid="submit-bank-account-btn"
          >
            {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Cuenta'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
