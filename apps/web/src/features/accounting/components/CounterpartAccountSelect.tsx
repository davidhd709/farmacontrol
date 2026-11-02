import { AccountAutocomplete } from './AccountAutocomplete';

/**
 * Cuenta imputable de contrapartida de un movimiento manual (ADR-006, F8): el asiento lleva
 * caja o banco contra esta cuenta. Se busca por código o nombre.
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
  return (
    <AccountAutocomplete
      value={value || null}
      onChange={(account) => onChange(account?.id ?? '')}
      label="Cuenta de contrapartida"
      postableOnly
      required
      disabled={disabled}
      helperText={helperText}
    />
  );
}
