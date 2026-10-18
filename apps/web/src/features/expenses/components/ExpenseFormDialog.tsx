import { useRef, useState } from 'react';
import {
  Box,
  Button,
  Grid,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ExpenseCategoryDto, BankAccountDto, ThirdPartyDto } from '@farmacia/contracts';
import { localIsoDate } from '../../../components/QuickDateRange';
import { ThirdPartyAutocomplete } from '../../third-parties/components/ThirdPartyAutocomplete';
import { createExpense } from '../api/expenses.api';
import { expenseSchema, type ExpenseFormData } from '../validation/expense.schema';

function formatCurrency(val: string | number | undefined): string {
  if (val === undefined || val === null) return '$0.00';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  categories: ExpenseCategoryDto[];
  bankAccounts: BankAccountDto[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}
export function ExpenseFormDialog({ categories, bankAccounts, onClose, onSuccess }: Props) {
  const [thirdParty, setThirdParty] = useState<ThirdPartyDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    mode: 'onBlur',
    defaultValues: {
      categoryId: categories[0]?.id ?? '',
      beneficiary: '',
      description: '',
      documentNumber: '',
      amount: '',
      expenseDate: localIsoDate(new Date()),
      dueDate: '',
      paymentMethod: 'EFECTIVO',
      bankAccountId: bankAccounts[0]?.id ?? '',
      notes: '',
    },
  });
  const paymentMethod = watch('paymentMethod');
  const submit = async (data: ExpenseFormData) => {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setError(null);
    const payload = {
      categoryId: data.categoryId,
      beneficiary: data.beneficiary.trim(),
      description: data.description.trim(),
      documentNumber: data.documentNumber.trim() || undefined,
      amount: data.amount,
      expenseDate: data.expenseDate,
      dueDate: data.paymentMethod === 'CREDITO' ? data.dueDate : undefined,
      paymentMethod: data.paymentMethod,
      bankAccountId: data.paymentMethod === 'TRANSFERENCIA' ? data.bankAccountId : undefined,
      notes: data.notes.trim() || undefined,
    };
    const fingerprint = JSON.stringify(payload);
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await createExpense(payload, retry.current.key);
      retry.current = null;
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el gasto.');
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };
  return (
    <Dialog open onClose={() => !submitting && onClose()} maxWidth="sm" fullWidth>
      <form noValidate onSubmit={handleSubmit(submit)}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>Registrar Causación de Gasto</DialogTitle>
        <DialogContent dividers>
          {Object.keys(errors).length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Revisa los campos señalados antes de confirmar el gasto.
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Controller
              name="categoryId"
              control={control}
              render={({ field: { ref, ...field } }) => (
                <TextField
                  select
                  label="Categoría de Gasto"
                  {...field}
                  inputRef={ref}
                  error={!!errors.categoryId}
                  helperText={errors.categoryId?.message}
                  required
                  fullWidth
                  size="small"
                >
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name} ({c.accountCode} - {c.accountName})
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />

            <Controller
              name="beneficiary"
              control={control}
              render={({ field }) => (
                <Box
                  ref={(element: HTMLDivElement | null) =>
                    field.ref(element?.querySelector('input'))
                  }
                >
                  <ThirdPartyAutocomplete
                    value={thirdParty}
                    onChange={(tp, raw) => {
                      setThirdParty(tp);
                      if (tp) {
                        field.onChange(tp.name);
                        if (tp.documentNumber && !getValues('documentNumber'))
                          setValue('documentNumber', tp.documentNumber);
                      } else if (raw !== undefined) field.onChange(raw);
                    }}
                    label="Beneficiario / Tercero / Proveedor"
                    placeholder="Buscar en el directorio o escribir nombre..."
                    required
                    freeSolo
                    showQuickCreate
                    disabled={submitting}
                    error={!!errors.beneficiary}
                    helperText={errors.beneficiary?.message}
                  />
                </Box>
              )}
            />

            <Controller
              name="description"
              control={control}
              render={({ field: { ref, ...field } }) => (
                <TextField
                  label="Concepto / Descripción del Gasto"
                  {...field}
                  inputRef={ref}
                  error={!!errors.description}
                  helperText={errors.description?.message}
                  required
                  fullWidth
                  placeholder="Ej. Servicio de energía eléctrica mes de septiembre"
                  size="small"
                />
              )}
            />

            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <Controller
                  name="documentNumber"
                  control={control}
                  render={({ field: { ref, ...field } }) => (
                    <TextField
                      label="Nº Factura / Documento Soporte"
                      {...field}
                      inputRef={ref}
                      error={!!errors.documentNumber}
                      helperText={errors.documentNumber?.message}
                      fullWidth
                      size="small"
                      placeholder="Ej. FAC-1029"
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field: { ref, ...field } }) => (
                    <TextField
                      label="Valor Total ($)"
                      type="number"
                      slotProps={{ htmlInput: { step: '0.01', min: '0.01' } }}
                      {...field}
                      inputRef={ref}
                      error={!!errors.amount}
                      helperText={errors.amount?.message}
                      required
                      fullWidth
                      size="small"
                    />
                  )}
                />
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <Controller
                  name="expenseDate"
                  control={control}
                  render={({ field: { ref, ...field } }) => (
                    <TextField
                      label="Fecha de Gasto"
                      type="date"
                      {...field}
                      inputRef={ref}
                      error={!!errors.expenseDate}
                      helperText={errors.expenseDate?.message}
                      required
                      fullWidth
                      size="small"
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Controller
                  name="paymentMethod"
                  control={control}
                  render={({ field: { ref, ...field } }) => (
                    <TextField
                      select
                      label="Forma de Pago"
                      {...field}
                      inputRef={ref}
                      error={!!errors.paymentMethod}
                      helperText={errors.paymentMethod?.message}
                      required
                      fullWidth
                      size="small"
                    >
                      <MenuItem value="EFECTIVO">Efectivo (Caja General)</MenuItem>
                      <MenuItem value="TRANSFERENCIA">Transferencia (Cuenta Bancaria)</MenuItem>
                      <MenuItem value="CREDITO">A Crédito (Pendiente por Pagar)</MenuItem>
                    </TextField>
                  )}
                />
              </Grid>
            </Grid>

            {paymentMethod === 'TRANSFERENCIA' && (
              <Controller
                name="bankAccountId"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    select
                    label="Cuenta Bancaria de Origen"
                    {...field}
                    inputRef={ref}
                    error={!!errors.bankAccountId}
                    helperText={errors.bankAccountId?.message}
                    required
                    fullWidth
                    size="small"
                  >
                    {bankAccounts.map((b) => (
                      <MenuItem key={b.id} value={b.id}>
                        {b.bankName} - {b.accountNumber} ({formatCurrency(b.currentBalance)})
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            )}

            {paymentMethod === 'CREDITO' && (
              <Controller
                name="dueDate"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    label="Fecha de Vencimiento de Pago"
                    type="date"
                    {...field}
                    inputRef={ref}
                    error={!!errors.dueDate}
                    helperText={errors.dueDate?.message}
                    required
                    fullWidth
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                )}
              />
            )}

            <Controller
              name="notes"
              control={control}
              render={({ field: { ref, ...field } }) => (
                <TextField
                  label="Notas / Observaciones"
                  {...field}
                  inputRef={ref}
                  error={!!errors.notes}
                  helperText={errors.notes?.message}
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting} color="inherit">
            Cancelar
          </Button>
          <Button type="submit" variant="contained" color="primary" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Confirmar Gasto'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
