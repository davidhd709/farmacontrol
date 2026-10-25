import { useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  TextField,
  Button,
  Alert,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  expenseReasonSchema,
  type ExpenseReasonFormData,
} from '../validation/expense-reason.schema';

interface Props {
  kind: 'cancel' | 'reverse';
  onClose: () => void;
  onSubmit: (data: ExpenseReasonFormData) => Promise<void>;
}
export function ExpenseReasonDialog({ kind, onClose, onSubmit }: Props) {
  const cancel = kind === 'cancel';
  const busy = useRef(false);
  const [isSubmitting, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ExpenseReasonFormData>({
    resolver: zodResolver(expenseReasonSchema),
    defaultValues: { reason: '' },
    mode: 'onBlur',
  });
  const submit = async (data: ExpenseReasonFormData) => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      await onSubmit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la operación.');
    } finally {
      busy.current = false;
      setSending(false);
    }
  };
  return (
    <Dialog open onClose={() => !isSubmitting && onClose()} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={handleSubmit(submit)}>
        <DialogTitle sx={{ color: cancel ? 'error.main' : 'warning.main', fontWeight: 'bold' }}>
          {cancel ? 'Anular Gasto Operativo' : 'Revertir Pago de Gasto'}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {cancel
              ? '¿Está seguro de anular este gasto? Se generará un asiento contable de reversión y se devolverán los fondos a tesorería si fue pagado de contado.'
              : 'Esta operación revertirá el pago, reintegrará el saldo pendiente a la obligación y registrará una entrada compensatoria en tesorería.'}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Controller
            name="reason"
            control={control}
            render={({ field: { ref, ...field } }) => (
              <TextField
                {...field}
                inputRef={ref}
                label={
                  cancel
                    ? 'Motivo de la Anulación (Obligatorio)'
                    : 'Motivo de la Reversión (Obligatorio)'
                }
                error={!!errors.reason}
                helperText={errors.reason?.message}
                required
                fullWidth
                multiline
                rows={3}
                size="small"
                placeholder={
                  cancel
                    ? 'Describa la razón de la anulación (mínimo 5 caracteres)...'
                    : 'Describa la razón de la reversión...'
                }
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="inherit" disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            color={cancel ? 'error' : 'warning'}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? cancel
                ? 'Anulando...'
                : 'Revirtiendo...'
              : cancel
                ? 'Confirmar Anulación'
                : 'Confirmar Reversión'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
