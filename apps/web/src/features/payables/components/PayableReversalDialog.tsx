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
import type { PayablePaymentDto } from '@farmacia/contracts';
import { revertPayablePayment } from '../api/payables.api';
import { reversalSchema, type ReversalFormData } from '../validation/reversal.schema';

interface Props {
  accountId: string;
  payment: PayablePaymentDto;
  onClose: () => void;
}
export function PayableReversalDialog({ accountId, payment, onClose }: Props) {
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
      if (!payment) throw new Error('No se seleccionó pago para revertir');
      return revertPayablePayment(accountId, payment.id, { reason: data.reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['payable-detail', accountId] });
      queryClient.invalidateQueries({ queryKey: ['payables-aging'] });
      onClose();
    },
    onSettled: () => {
      reversing.current = false;
    },
    onError: (err: Error) => {
      setError(err.message || 'Error al revertir el pago.');
    },
  });

  return (
    <Dialog open onClose={() => !reverseMutation.isPending && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Revertir Pago al Proveedor</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Esta acción restituirá el saldo pendiente de la obligación y registrará una operación
          compensatoria en {payment?.paymentMethod === 'TRANSFERENCIA' ? 'el banco' : 'la caja'}.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Controller
          name="reason"
          control={reversal.control}
          render={({ field: { ref, ...field } }) => (
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Motivo de la reversión"
              error={!!reversal.formState.errors.reason}
              helperText={reversal.formState.errors.reason?.message}
              {...field}
              inputRef={ref}
              placeholder="Ej: Monto ingresado por error / Factura equivocada"
              multiline
              rows={2}
              required
            />
          )}
        />
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
          {reverseMutation.isPending ? 'Revirtiendo…' : 'Confirmar Reversión'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
