import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { ApiError } from '../../../api/http-client';
import type { AccountDto, AccountPayload, AccountType } from '../api/accounting.api';
import { useCreateAccount, useUpdateAccount } from '../hooks/useAccounting';

const accountTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'COST'] as const;
export const accountTypeLabels: Record<AccountType, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  COST: 'Costo',
};
const schema = z.object({
  code: z.string().trim().min(1, 'Ingresa el código.'),
  name: z.string().trim().min(1, 'Ingresa el nombre.'),
  type: z.enum(accountTypes),
  parentId: z.string(),
  allowsMovement: z.boolean(),
  isActive: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function AccountFormDialog({
  open,
  account,
  accounts,
  onClose,
}: {
  open: boolean;
  account: AccountDto | null;
  accounts: AccountDto[];
  onClose: () => void;
}) {
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const busy = create.isPending || update.isPending;
  const [error, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: '',
      name: '',
      type: 'ASSET',
      parentId: '',
      allowsMovement: true,
      isActive: true,
    },
  });
  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    reset({
      code: account?.code ?? '',
      name: account?.name ?? '',
      type: account?.type ?? 'ASSET',
      parentId: account?.parentId ?? '',
      allowsMovement: account?.allowsMovement ?? true,
      isActive: account?.isActive ?? true,
    });
  }, [open, account, reset]);
  const selectedType = watch('type');
  const invalidParentIds = new Set<string>();
  if (account) {
    invalidParentIds.add(account.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of accounts) {
        if (
          candidate.parentId &&
          invalidParentIds.has(candidate.parentId) &&
          !invalidParentIds.has(candidate.id)
        ) {
          invalidParentIds.add(candidate.id);
          changed = true;
        }
      }
    }
  }
  const parentChoices = accounts.filter(
    (candidate) =>
      candidate.isActive &&
      !candidate.allowsMovement &&
      candidate.type === selectedType &&
      !invalidParentIds.has(candidate.id),
  );

  const submit = async (values: FormValues) => {
    setSubmitError(null);
    const payload: AccountPayload = {
      code: values.code.trim(),
      name: values.name.trim(),
      type: values.type,
      parentId: values.parentId || null,
      allowsMovement: values.allowsMovement,
      isActive: values.isActive,
    };
    try {
      if (account) await update.mutateAsync({ id: account.id, payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError('code', { message: 'El código ya existe o entra en conflicto con otra cuenta.' });
      } else {
        setSubmitError(cause instanceof Error ? cause.message : 'No se pudo guardar la cuenta.');
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="account-dialog-title"
    >
      <form onSubmit={handleSubmit(submit)} noValidate>
        <DialogTitle id="account-dialog-title">
          {account ? 'Editar cuenta' : 'Nueva cuenta'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Controller
              name="code"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Código"
                  required
                  autoFocus
                  fullWidth
                  disabled={busy}
                  error={!!errors.code}
                  helperText={errors.code?.message}
                />
              )}
            />
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Nombre"
                  required
                  fullWidth
                  disabled={busy}
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              )}
            />
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Tipo"
                  required
                  fullWidth
                  disabled={busy}
                  error={!!errors.type}
                  helperText={errors.type?.message}
                >
                  {accountTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {accountTypeLabels[type]}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="parentId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="Cuenta padre"
                  fullWidth
                  disabled={busy}
                  helperText="Opcional. Se muestran cuentas agrupadoras activas del mismo tipo."
                >
                  <MenuItem value="">Sin cuenta padre</MenuItem>
                  {parentChoices.map((parent) => (
                    <MenuItem key={parent.id} value={parent.id}>
                      {parent.code} — {parent.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="allowsMovement"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={field.value}
                      onChange={(_, checked) => field.onChange(checked)}
                      disabled={busy}
                    />
                  }
                  label="Permite movimientos contables"
                />
              )}
            />
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={field.value}
                      onChange={(_, checked) => field.onChange(checked)}
                      disabled={busy}
                    />
                  }
                  label="Cuenta activa"
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} /> : undefined}
          >
            {busy ? 'Guardando…' : 'Guardar cuenta'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
