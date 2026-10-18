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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ReceivablePaymentDto } from '@farmacia/contracts';
import { revertReceivablePayment } from '../api/receivables.api';
import { reversalSchema, type ReversalFormData } from '../validation/reversal.schema';

interface Props {
  accountId: string;
  payment: ReceivablePaymentDto;
  onClose: () => void;
}
export function ReceivableReversalDialog({ accountId, payment, onClose }: Props) {
  const queryClient = useQueryClient();
  const reversing = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const reversal = useForm<ReversalFormData>({
    resolver: zodResolver(reversalSchema),
    defaultValues: { reason: '' },
    mode: 'onBlur',
  });
  const reverseMutation = useMutation({
    mutationFn: (data: ReversalFormData) => {
      if (!payment) throw new Error('No se seleccionó abono para revertir');
      return revertReceivablePayment(accountId, payment.id, { reason: data.reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['receivable-detail', accountId] });
      queryClient.invalidateQueries({ queryKey: ['receivables-aging'] });
      onClose();
    },
    onSettled: () => {
      reversing.current = false;
    },
    onError: (err: Error) => {
      setError(err.message || 'Error al revertir el abono.');
    },
  });

  return (
    <Dialog open onClose={() => !reverseMutation.isPending && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Revertir Abono de Cliente</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          ¿Estás seguro de anular el abono por{' '}
          <strong>
            $
            {Number(payment?.amount ?? 0).toLocaleString('es-CO', {
              minimumFractionDigits: 2,
            })}
          </strong>{' '}
          ({payment?.paymentMethod})? El saldo de la cuenta por cobrar aumentará nuevamente y se
          registrará un egreso compensatorio en caja o bancos.
        </Typography>

        <Controller
          name="reason"
          control={reversal.control}
          render={({ field: { ref, ...field } }) => (
            <TextField
              label="Motivo de la anulación"
              placeholder="Ej: Error en valor digitado, cheque rechazado, etc."
              fullWidth
              size="small"
              required
              multiline
              rows={2}
              error={!!reversal.formState.errors.reason}
              helperText={reversal.formState.errors.reason?.message}
              {...field}
              inputRef={ref}
            />
          )}
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={reverseMutation.isPending}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={reversal.handleSubmit((data) => {
            if (reversing.current) return;
            reversing.current = true;
            reverseMutation.mutate(data);
          })}
          disabled={reverseMutation.isPending}
        >
          {reverseMutation.isPending ? 'Anulando…' : 'Confirmar Anulación'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
