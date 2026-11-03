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
import type { ExpenseCategoryDto, ThirdPartyDto } from '@farmacia/contracts';
import { localIsoDate } from '../../../components/QuickDateRange';
import { ThirdPartyAutocomplete } from '../../third-parties/components/ThirdPartyAutocomplete';
import { createExpense } from '../api/expenses.api';
import { expenseSchema, type ExpenseFormData } from '../validation/expense.schema';
import { DateField } from '../../../components/DateField';

interface Props {
  categories: ExpenseCategoryDto[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}
export function ExpenseFormDialog({ categories, onClose, onSuccess }: Props) {
  const [thirdParty, setThirdParty] = useState<ThirdPartyDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
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
      notes: '',
    },
  });
  const submit = async (data: ExpenseFormData) => {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setError(null);
    const payload = {
      categoryId: data.categoryId,
      // Un proveedor del directorio queda vinculado: su estado de cuenta y el egreso que la paga
      supplierId: thirdParty!.supplierId!,
      beneficiary: data.beneficiary.trim(),
      description: data.description.trim(),
      documentNumber: data.documentNumber.trim() || undefined,
      amount: data.amount,
      expenseDate: data.expenseDate,
      dueDate: data.dueDate || undefined,
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
                    onChange={(tp) => {
                      setThirdParty(tp);
                      // Solo un proveedor del directorio: la deuda queda en su estado de cuenta
                      field.onChange(tp?.supplierId ? tp.name : '');
                      if (tp?.documentNumber && !getValues('documentNumber'))
                        setValue('documentNumber', tp.documentNumber);
                    }}
                    role="SUPPLIER"
                    label="Proveedor"
                    placeholder="Buscar proveedor en el directorio..."
                    required
                    showQuickCreate
                    disabled={submitting}
                    error={!!errors.beneficiary || Boolean(thirdParty && !thirdParty.supplierId)}
                    helperText={
                      thirdParty && !thirdParty.supplierId
                        ? 'El tercero elegido no está registrado como proveedor.'
                        : errors.beneficiary?.message
                    }
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
                    <DateField
                      label="Fecha de Gasto"
                      {...field}
                      inputRef={ref}
                      error={!!errors.expenseDate}
                      helperText={errors.expenseDate?.message}
                      required
                      fullWidth
                      size="small"
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Controller
                  name="dueDate"
                  control={control}
                  render={({ field: { ref, ...field } }) => (
                    <DateField
                      label="Fecha de Vencimiento"
                      {...field}
                      inputRef={ref}
                      error={!!errors.dueDate}
                      helperText={
                        errors.dueDate?.message ?? 'Opcional: sin fecha vence el día del gasto'
                      }
                      fullWidth
                      size="small"
                    />
                  )}
                />
              </Grid>
            </Grid>

            <Alert severity="info" variant="outlined">
              La causación reconoce el gasto y la cuenta por pagar al proveedor. El pago se registra
              después con un comprobante de egreso.
            </Alert>

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
