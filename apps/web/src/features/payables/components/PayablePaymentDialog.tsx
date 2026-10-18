import { PayableReversalDialog } from './PayableReversalDialog';
import { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
  FormHelperText,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Alert,
  Divider,
  Collapse,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import type { PayableDto, PayablePaymentDto } from '@farmacia/contracts';
import { fetchPayableById, registerPayablePayment } from '../api/payables.api';

import { useBankAccountOptions } from '../../treasury/hooks/useTreasury';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

import { createPaymentSchema, type PaymentFormData } from '../validation/payment.schema';
import { toCents } from '../../../utils/money';
import { statusConfig, isOverdue } from '../utils/status';
interface PaymentModalProps {
  payable: PayableDto;
  onClose: () => void;
  onSuccess: () => void;
}

export function PayablePaymentDialog({ payable, onClose, onSuccess }: PaymentModalProps) {
  const [showPayments, setShowPayments] = useState(false);
  const [reversalTarget, setReversalTarget] = useState<PayablePaymentDto | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PaymentFormData | null>(null);
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  const { data: detail } = useQuery({
    queryKey: ['payable-detail', payable.id],
    queryFn: () => fetchPayableById(payable.id),
    initialData: payable,
  });

  const balanceValue = detail?.balance ?? payable.balance;
  const balance = Number(balanceValue);
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(createPaymentSchema(balanceValue)),
    mode: 'onBlur',
    defaultValues: { amount: '', paymentMethod: 'EFECTIVO', bankAccountId: '', notes: '' },
  });
  const paymentMethod = watch('paymentMethod');
  const bankAccounts = useBankAccountOptions(paymentMethod === 'TRANSFERENCIA');

  const mutation = useMutation({
    mutationFn: (data: PaymentFormData) => {
      const fingerprint = JSON.stringify(data);
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, key: crypto.randomUUID() };
      return registerPayablePayment(
        payable.id,
        {
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          bankAccountId: data.paymentMethod === 'TRANSFERENCIA' ? data.bankAccountId : undefined,
          notes: data.notes || null,
        },
        retry.current.key,
      );
    },
    onSuccess: () => {
      retry.current = null;
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['payable-detail', payable.id] });
      queryClient.invalidateQueries({ queryKey: ['payables-aging'] });
      reset();
      onSuccess();
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  const canPay = detail?.status === 'PENDIENTE' && toCents(balanceValue) > 0;

  return (
    <Dialog
      open
      onClose={() => !mutation.isPending && onClose()}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2.5,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          },
        },
      }}
    >
      <DialogTitle>
        <Box>
          <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
            Cuenta por Pagar
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Factura {detail?.invoiceNumber ?? '—'} · {detail?.supplierName ?? '—'}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Resumen financiero */}
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          {[
            {
              label: 'Total',
              value: Number(detail?.totalAmount ?? payable.totalAmount),
              color: undefined,
            },
            {
              label: 'Pagado',
              value: Number(detail?.amountPaid ?? payable.amountPaid),
              color: 'success.main',
            },
            { label: 'Saldo', value: balance, color: canPay ? 'warning.dark' : undefined },
          ].map(({ label, value, color }) => (
            <Paper
              key={label}
              variant="outlined"
              sx={{
                flex: 1,
                p: 1.5,
                textAlign: 'center',
                borderRadius: 2,
                bgcolor: label === 'Saldo' && canPay ? 'warning.50' : undefined,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color }}>
                ${value.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
              </Typography>
            </Paper>
          ))}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Vence:
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: isOverdue(detail?.dueDate ?? payable.dueDate, detail?.status ?? payable.status)
                ? 'error.main'
                : 'text.primary',
            }}
          >
            {new Date((detail?.dueDate ?? payable.dueDate) + 'T12:00:00').toLocaleDateString(
              'es-CO',
              {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              },
            )}
          </Typography>
          <Chip
            size="small"
            label={statusConfig[detail?.status ?? payable.status].label}
            color={statusConfig[detail?.status ?? payable.status].color}
          />
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* Historial de Pagos con soporte de Reversión */}
        {(detail?.payments?.length ?? 0) > 0 && (
          <Box sx={{ mb: 2 }}>
            <Button
              size="small"
              onClick={() => setShowPayments((v) => !v)}
              sx={{ mb: 1, textTransform: 'none' }}
            >
              {showPayments ? '▲ Ocultar' : '▼ Ver'} pagos ({detail?.payments?.length})
            </Button>
            <Collapse in={showPayments}>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell align="right">Monto</TableCell>
                      <TableCell>Método</TableCell>
                      <TableCell align="center">Estado / Acción</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail?.payments?.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{new Date(p.createdAt).toLocaleDateString('es-CO')}</TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontWeight: 600,
                            color: p.isReversed ? 'text.disabled' : 'error.main',
                            textDecoration: p.isReversed ? 'line-through' : 'none',
                          }}
                        >
                          -${Number(p.amount).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>{p.paymentMethod}</TableCell>
                        <TableCell align="center">
                          {p.isReversed ? (
                            <Box>
                              <Chip
                                label="Revertido"
                                size="small"
                                color="error"
                                variant="outlined"
                              />
                              {p.reversalReason && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: 'block' }}
                                >
                                  {p.reversalReason}
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            <Button
                              size="small"
                              color="error"
                              variant="text"
                              sx={{ textTransform: 'none' }}
                              onClick={() => {
                                setReversalTarget(p);
                              }}
                            >
                              Revertir
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Collapse>
          </Box>
        )}

        {/* Diálogo de Confirmación de Reversión */}
        {reversalTarget && (
          <PayableReversalDialog
            accountId={payable.id}
            payment={reversalTarget}
            onClose={() => setReversalTarget(null)}
          />
        )}

        {/* Formulario */}
        {canPay && (
          <Box
            component="form"
            id="payable-payment-form"
            noValidate
            onSubmit={handleSubmit((d) => {
              if (!submitting.current) setPendingPayment(d);
            })}
          >
            <Typography variant="subtitle2" gutterBottom>
              Registrar Pago al Proveedor
            </Typography>

            {mutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {(mutation.error as Error)?.message ?? 'Error al registrar el pago'}
              </Alert>
            )}
            {mutation.isSuccess && (
              <Alert severity="success" sx={{ mb: 2 }}>
                Pago registrado correctamente
              </Alert>
            )}

            <Stack spacing={2}>
              <Controller
                name="amount"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    {...field}
                    inputRef={ref}
                    label="Monto del pago"
                    type="number"
                    slotProps={{
                      htmlInput: { min: 0.01, max: balance, step: 0.01 },
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                    }}
                    error={!!errors.amount}
                    helperText={
                      errors.amount?.message ??
                      `Máximo: $${balance.toLocaleString('es-CO', { minimumFractionDigits: 2 })}`
                    }
                    size="small"
                    autoFocus
                  />
                )}
              />

              <Controller
                name="paymentMethod"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <FormControl size="small" error={!!errors.paymentMethod}>
                    <InputLabel id="payables-method-label">Método de pago</InputLabel>
                    <Select
                      {...field}
                      inputRef={ref}
                      labelId="payables-method-label"
                      aria-describedby="payables-method-help"
                      label="Método de pago"
                    >
                      <MenuItem value="EFECTIVO">Efectivo</MenuItem>
                      <MenuItem value="TRANSFERENCIA">Transferencia</MenuItem>
                    </Select>
                    <FormHelperText id="payables-method-help">
                      {errors.paymentMethod?.message}
                    </FormHelperText>
                  </FormControl>
                )}
              />

              {paymentMethod === 'TRANSFERENCIA' && (
                <Controller
                  name="bankAccountId"
                  control={control}
                  render={({ field: { ref, ...field } }) => (
                    <FormControl
                      size="small"
                      required
                      error={!!errors.bankAccountId || bankAccounts.isError}
                    >
                      <InputLabel id="payable-bank-account-label">Cuenta de origen</InputLabel>
                      <Select
                        {...field}
                        inputRef={ref}
                        labelId="payable-bank-account-label"
                        aria-describedby="payable-bank-account-help"
                        label="Cuenta de origen"
                        disabled={bankAccounts.isPending || bankAccounts.isError}
                      >
                        {(bankAccounts.data ?? []).map((account) => (
                          <MenuItem key={account.id} value={account.id}>
                            {account.name} · {account.bankName}
                            {account.accountNumberLast4 ? ` ···${account.accountNumberLast4}` : ''}
                          </MenuItem>
                        ))}
                      </Select>
                      {(errors.bankAccountId || bankAccounts.isError) && (
                        <FormHelperText id="payable-bank-account-help">
                          {errors.bankAccountId?.message ??
                            'No se pudieron consultar las cuentas bancarias.'}
                        </FormHelperText>
                      )}
                    </FormControl>
                  )}
                />
              )}

              <Controller
                name="notes"
                control={control}
                render={({ field: { ref, ...field } }) => (
                  <TextField
                    {...field}
                    inputRef={ref}
                    label="Observaciones (opcional)"
                    multiline
                    rows={2}
                    size="small"
                  />
                )}
              />
            </Stack>
          </Box>
        )}

        {!canPay && (
          <Alert severity={detail?.status === 'PAGADA' ? 'success' : 'info'}>
            {detail?.status === 'PAGADA'
              ? 'Esta cuenta está completamente pagada.'
              : 'Esta cuenta no puede recibir pagos en su estado actual.'}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>
          Cerrar
        </Button>
        {canPay && (
          <Button
            type="submit"
            form="payable-payment-form"
            variant="contained"
            color="error"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Registrando…' : 'Pagar Proveedor'}
          </Button>
        )}
      </DialogActions>

      <ConfirmDialog
        open={Boolean(pendingPayment)}
        title="Confirmar Pago a Proveedor"
        description={`¿Estás seguro de registrar un pago de $${Number(pendingPayment?.amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })} mediante ${pendingPayment?.paymentMethod} para la factura ${detail?.invoiceNumber ?? '—'} del proveedor ${detail?.supplierName ?? '—'}? Esta operación registrará la salida de dinero en ${pendingPayment?.paymentMethod === 'TRANSFERENCIA' ? 'banco' : 'caja'}.`}
        confirmText="Confirmar y Pagar"
        confirmColor="error"
        isLoading={mutation.isPending}
        onConfirm={() => {
          if (pendingPayment && !submitting.current) {
            submitting.current = true;
            const parsed = createPaymentSchema(balanceValue).safeParse(pendingPayment);
            if (parsed.success) mutation.mutate(parsed.data);
            else {
              submitting.current = false;
              void handleSubmit(() => {})();
            }
            setPendingPayment(null);
          }
        }}
        onCancel={() => setPendingPayment(null)}
      />
    </Dialog>
  );
}
