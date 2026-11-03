import { Autocomplete, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchAccounts, fetchCounterpartAccounts, type AccountDto } from '../api/accounting.api';

/** El texto escrito coincide con el inicio del código o con cualquier parte del nombre. */
export function matchesAccount(account: AccountDto, text: string) {
  const term = text.trim().toLocaleLowerCase('es-CO');
  if (!term) return true;
  return account.code.startsWith(term) || account.name.toLocaleLowerCase('es-CO').includes(term);
}

/** Buscador rápido de cuentas del PUC por código o nombre. */
export function AccountAutocomplete({
  value,
  onChange,
  label = 'Buscar cuenta (código o nombre)',
  postableOnly = false,
  required,
  disabled,
  helperText,
  error,
  counterpartsOnly = false,
}: {
  value: string | null;
  onChange: (account: AccountDto | null) => void;
  label?: string;
  /** Solo cuentas activas e imputables (las que admiten movimientos) */
  postableOnly?: boolean;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  error?: boolean;
  /** Solo las cuentas de contrapartida (no exige el permiso contable). */
  counterpartsOnly?: boolean;
}) {
  const accounts = useQuery({
    queryKey: ['accounting', counterpartsOnly ? 'counterpart-accounts' : 'accounts'],
    queryFn: counterpartsOnly ? fetchCounterpartAccounts : fetchAccounts,
  });
  const options = (accounts.data ?? []).filter(
    (a) => !postableOnly || (a.isActive && a.allowsMovement),
  );
  const selected = options.find((a) => a.id === value) ?? null;
  return (
    <Autocomplete<AccountDto>
      options={options}
      value={selected}
      onChange={(_, account) => onChange(account)}
      filterOptions={(list, state) =>
        list.filter((a) => matchesAccount(a, state.inputValue)).slice(0, 50)
      }
      getOptionLabel={(a) => `${a.code} · ${a.name}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      loading={accounts.isLoading}
      disabled={disabled}
      noOptionsText="Ninguna cuenta coincide"
      loadingText="Cargando plan de cuentas…"
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label={label}
          required={required}
          error={error || accounts.isError}
          helperText={accounts.isError ? 'No se pudo cargar el plan de cuentas.' : helperText}
        />
      )}
    />
  );
}
