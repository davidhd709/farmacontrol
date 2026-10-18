import { ReceivableReversalDialog } from './ReceivableReversalDialog';
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
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { type ReceivableDto, type ReceivablePaymentDto } from '@farmacia/contracts';
import { fetchReceivableById, registerReceivablePayment } from '../api/receivables.api';

import { useBankAccountOptions } from '../../treasury/hooks/useTreasury';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

import { createPaymentSchema, type PaymentFormData } from '../validation/payment.schema';
import { toCents } from '../../../utils/money';
import { isOverdue, getStatusDisplay } from '../utils/status';
interface PaymentModalProps {
  receivable: ReceivableDto;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReceivablePaymentDialog({ receivable, onClose, onSuccess }: PaymentModalProps) {
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  const { data: detail } = useQuery({
    queryKey: ['receivable-detail', receivable.id],
    queryFn: () => fetchReceivableById(receivable.id),
    initialData: receivable,
  });

  const [reversalTarget, setReversalTarget] = useState<ReceivablePaymentDto | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PaymentFormData | null>(null);

  const balanceValue = detail?.balance ?? receivable.balance;
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
      return registerReceivablePayment(
        receivable.id,
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
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['receivable-detail', receivable.id] });
      queryClient.invalidateQueries({ queryKey: ['receivables-aging'] });
      reset();
      onSuccess();
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  const canPay = detail?.status === 'PENDIENTE' && toCents(balanceValue) > 0;
  const statusDisplay = getStatusDisplay(detail?.status ?? receivable.status);

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
            Cuenta por Cobrar
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Factura {detail?.invoiceNumber ?? '—'} · {detail?.customerName ?? '—'}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Resumen financiero */}
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <Paper variant="outlined" sx={{ flex: 1, p: 1.5, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Total
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              $
              {Number(detail?.totalAmount ?? receivable.totalAmount).toLocaleString('es-CO', {
                minimumFractionDigits: 2,
              })}
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ flex: 1, p: 1.5, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Pagado
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
              $
              {Number(detail?.amountPaid ?? receivable.amountPaid).toLocaleString('es-CO', {
                minimumFractionDigits: 2,
              })}
            </Typography>
          </Paper>
          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              p: 1.5,
              textAlign: 'center',
              borderRadius: 2,
              bgcolor: canPay ? 'warning.50' : undefined,
              borderColor: canPay ? 'warning.main' : undefined,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Saldo
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: canPay ? 'warning.dark' : 'text.primary',
              }}
            >
              ${balance.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
            </Typography>
          </Paper>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Vence:
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: isOverdue(
                detail?.dueDate ?? receivable.dueDate,
                detail?.status ?? receivable.status,
              )
                ? 'error.main'
                : 'text.primary',
            }}
          >
            {new Date((detail?.dueDate ?? receivable.dueDate) + 'T12:00:00').toLocaleDateString(
              'es-CO',
              {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              },
            )}
            {isOverdue(
              detail?.dueDate ?? receivable.dueDate,
              detail?.status ?? receivable.status,
            ) && ' ⚠ Vencida'}
          </Typography>
          <Chip size="small" label={statusDisplay.label} color={statusDisplay.color} />
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* Registro Histórico de Abonos */}
        <Box sx={{ mb: 3 }}>
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                color: 'text.primary',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              Historial de Abonos Registrados
              <Chip
                size="small"
                label={`${detail?.payments?.length ?? 0} abono(s)`}
                color={(detail?.payments?.length ?? 0) > 0 ? 'primary' : 'default'}
                variant="outlined"
              />
            </Typography>
          </Box>

          {(detail?.payments?.length ?? 0) > 0 ? (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: 'grey.50' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Fecha y Hora</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Valor Abonado
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Método</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Observaciones</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>
                      Estado / Acción
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail?.payments?.map((p) => {
                    const pDate = new Date(p.createdAt);
                    const formattedDate = !isNaN(pDate.getTime())
                      ? `${pDate.toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })} ${pDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`
                      : p.createdAt;

                    return (
                      <TableRow key={p.id} hover>
                        <TableCell sx={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          {formattedDate}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontWeight: 700,
                            color: p.isReversed ? 'text.disabled' : 'success.main',
                            fontSize: '0.9rem',
                            textDecoration: p.isReversed ? 'line-through' : 'none',
                          }}
                        >
                          +${Number(p.amount).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={p.paymentMethod.replace('_', ' ')}
                            color="info"
                            variant="outlined"
                            sx={{ fontSize: '0.75rem', height: 22 }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                          {p.notes || '—'}
                        </TableCell>
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
                              sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                              onClick={() => {
                                setReversalTarget(p);
                              }}
                            >
                              Revertir
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
              Aún no se han registrado abonos para esta factura.
            </Alert>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Formulario de Registrar Nuevo Abono */}
        {canPay && (
          <Box
            component="form"
            id="payment-form"
            noValidate
            onSubmit={handleSubmit((d) => {
              if (!submitting.current) setPendingPayment(d);
            })}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Registrar Nuevo Abono
            </Typography>

            {mutation.isError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {(mutation.error as Error)?.message ?? 'Error al registrar el abono'}
              </Alert>
            )}
            {mutation.isSuccess && (
              <Alert severity="success" sx={{ mb: 2 }}>
                Abono registrado correctamente y aplicado al saldo.
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
                    label="Monto del abono"
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
                      `Saldo pendiente máximo a abonar: $${balance.toLocaleString('es-CO', { minimumFractionDigits: 2 })}`
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
                    <InputLabel id="receivables-method-label">Método de pago</InputLabel>
                    <Select
                      {...field}
                      inputRef={ref}
                      labelId="receivables-method-label"
                      aria-describedby="receivables-method-help"
                      label="Método de pago"
                    >
                      <MenuItem value="EFECTIVO">Efectivo</MenuItem>
                      <MenuItem value="TRANSFERENCIA">Transferencia</MenuItem>
                    </Select>
                    <FormHelperText id="receivables-method-help">
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
                      <InputLabel id="receivable-bank-account-label">Cuenta que recibe</InputLabel>
                      <Select
                        {...field}
                        inputRef={ref}
                        labelId="receivable-bank-account-label"
                        aria-describedby="receivable-bank-account-help"
                        label="Cuenta que recibe"
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
                        <FormHelperText id="receivable-bank-account-help">
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
                    label="Observaciones o soporte del abono (opcional)"
                    placeholder="Ej. Comprobante Nequi / Bancolombia #12345"
                    multiline
                    rows={2}
                    size="small"
                  />
                )}
              />
            </Stack>
          </Box>
        )}

        {!canPay && !statusDisplay.recognized && (
          <Alert severity="warning">
            El estado "{detail?.status ?? receivable.status}" no es reconocido por el sistema. La
            cuenta no admite abonos; informe al administrador para revisar su consistencia.
          </Alert>
        )}

        {!canPay && statusDisplay.recognized && (
          <Alert severity={detail?.status === 'PAGADA' ? 'success' : 'info'}>
            {detail?.status === 'PAGADA'
              ? 'Esta cuenta por cobrar se encuentra totalmente pagada (saldo $0,00).'
              : detail?.status === 'ANULADA'
                ? 'La venta de origen fue anulada: el saldo no constituye deuda pendiente y la cuenta no admite abonos.'
                : 'Esta cuenta no puede recibir abonos en su estado actual.'}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={mutation.isPending} variant="outlined" color="inherit">
          Cerrar
        </Button>
        {canPay && (
          <Button
            type="submit"
            form="payment-form"
            variant="contained"
            disabled={mutation.isPending}
            sx={{ fontWeight: 600, px: 3 }}
          >
            {mutation.isPending ? 'Registrando Abono…' : 'Registrar Abono'}
          </Button>
        )}
      </DialogActions>

      {/* Diálogo de Confirmación de Reversión */}
      {reversalTarget && (
        <ReceivableReversalDialog
          accountId={receivable.id}
          payment={reversalTarget}
          onClose={() => setReversalTarget(null)}
        />
      )}

      {/* Diálogo de Confirmación: Registrar Abono */}
      <ConfirmDialog
        open={Boolean(pendingPayment)}
        onClose={() => setPendingPayment(null)}
        onConfirm={() => {
          if (pendingPayment && !submitting.current) {
            submitting.current = true;
            setPendingPayment(null);
            const parsed = createPaymentSchema(balanceValue).safeParse(pendingPayment);
            if (parsed.success) mutation.mutate(parsed.data);
            else {
              submitting.current = false;
              void handleSubmit(() => {})();
            }
          }
        }}
        isLoading={mutation.isPending}
        title="Confirmar Registro de Abono"
        description={
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              ¿Estás seguro de registrar un abono por{' '}
              <strong>
                $
                {Number(pendingPayment?.amount || 0).toLocaleString('es-CO', {
                  minimumFractionDigits: 2,
                })}
              </strong>
              ?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Factura:</strong> {detail?.invoiceNumber || receivable.invoiceNumber}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Cliente:</strong> {detail?.customerName || receivable.customerName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Método de pago:</strong> {pendingPayment?.paymentMethod}
            </Typography>
          </Stack>
        }
        confirmText="Confirmar y Abonar"
        confirmColor="primary"
      />
    </Dialog>
  );
}
