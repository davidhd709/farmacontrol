import { MenuItem, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchAccounts } from '../api/accounting.api';

/**
 * Cuenta imputable de contrapartida de un movimiento manual (ADR-006, F8): el asiento lleva
 * caja o banco contra esta cuenta.
 */
export function CounterpartAccountSelect({
  value,
  onChange,
  disabled,
  helperText = 'Cuenta contable que explica el movimiento (gasto, aporte, préstamo, etc.)',
}: {
  value: string;
  onChange: (accountId: string) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  const accounts = useQuery({ queryKey: ['accounting', 'accounts'], queryFn: fetchAccounts });
  const options = (accounts.data ?? []).filter((a) => a.isActive && a.allowsMovement);
  return (
    <TextField
      select
      fullWidth
      required
      label="Cuenta de contrapartida"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || accounts.isLoading}
      helperText={
        accounts.isError
          ? 'No se pudo cargar el plan de cuentas.'
          : options.length === 0 && !accounts.isLoading
            ? 'No hay cuentas imputables: configure el plan de cuentas.'
            : helperText
      }
      error={accounts.isError}
    >
      {options.map((a) => (
        <MenuItem key={a.id} value={a.id}>
          {a.code} · {a.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
