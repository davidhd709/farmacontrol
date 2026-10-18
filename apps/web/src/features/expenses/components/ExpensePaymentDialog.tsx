import { useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
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
import type { ExpenseDto, BankAccountDto } from '@farmacia/contracts';
import { localIsoDate } from '../../../components/QuickDateRange';

import { payExpense } from '../api/expenses.api';

import {
  createExpensePaymentSchema,
  type ExpensePaymentFormData,
} from '../validation/expense-payment.schema';
function formatCurrency(val: string | number | undefined): string {
  if (val === undefined || val === null) return '$0.00';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  expense: ExpenseDto;
  bankAccounts: BankAccountDto[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}
export function ExpensePaymentDialog({ expense, bankAccounts, onClose, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const [submitting, setSending] = useState(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ExpensePaymentFormData>({
    resolver: zodResolver(createExpensePaymentSchema(expense.balance)),
    mode: 'onBlur',
    defaultValues: {
      amount: expense.balance,
      paymentDate: localIsoDate(new Date()),
      paymentMethod: 'EFECTIVO',
      bankAccountId: bankAccounts[0]?.id ?? '',
      notes: '',
    },
  });
  const paymentMethod = watch('paymentMethod');
  const submit = async (data: ExpensePaymentFormData) => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    const payload = {
      amount: data.amount,
      paymentDate: data.paymentDate,
      paymentMethod: data.paymentMethod,
      bankAccountId: data.paymentMethod === 'TRANSFERENCIA' ? data.bankAccountId : undefined,
      notes: data.notes.trim() || undefined,
    };
    const fingerprint = JSON.stringify(payload);
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await payExpense(expense.id, payload, retry.current.key);
      retry.current = null;
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el pago.');
    } finally {
      busy.current = false;
      setSending(false);
    }
  };
  return (
    <Dialog open onClose={() => !submitting && onClose()} maxWidth="sm" fullWidth>
      <form noValidate onSubmit={handleSubmit(submit)}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>Pagar / Abonar Gasto</DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {expense && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <Box sx={{ p: 2, backgroundColor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>Beneficiario:</strong> {expense.beneficiary}
                </Typography>
                <Typography variant="body2">
                  <strong>Concepto:</strong> {expense.description}
                </Typography>
                <Typography variant="body2">
                  <strong>Total Obligación:</strong> {formatCurrency(expense.amount)}
                </Typography>
                <Typography variant="body2">
                  <strong>Monto Pagado:</strong> {formatCurrency(expense.amountPaid)}
                </Typography>
                <Typography variant="h6" sx={{ color: 'warning.main', fontWeight: 'bold', mt: 1 }}>
                  Saldo Pendiente: {formatCurrency(expense.balance)}
                </Typography>
              </Box>

              <Controller
                name="amount"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    label="Monto a Pagar ($)"
                    type="number"
                    slotProps={{ htmlInput: { step: '0.01', min: '0.01', max: expense.balance } }}
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

              <Controller
                name="paymentDate"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    label="Fecha del Pago"
                    type="date"
                    {...field}
                    inputRef={ref}
                    error={!!errors.paymentDate}
                    helperText={errors.paymentDate?.message}
                    required
                    fullWidth
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                )}
              />

              <Controller
                name="paymentMethod"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    select
                    label="Medio de Pago"
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
                  </TextField>
                )}
              />

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

              <Controller
                name="notes"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    label="Notas / Referencia del Pago"
                    {...field}
                    inputRef={ref}
                    error={!!errors.notes}
                    helperText={errors.notes?.message}
                    fullWidth
                    size="small"
                    placeholder="Ej. Recibo de caja menor, comprobante N° 123"
                  />
                )}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting} color="inherit">
            Cancelar
          </Button>
          <Button type="submit" variant="contained" color="success" disabled={submitting}>
            {submitting ? 'Procesando...' : 'Confirmar Pago'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
