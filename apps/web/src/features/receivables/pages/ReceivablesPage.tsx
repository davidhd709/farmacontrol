import { useState, useCallback, useRef } from 'react';
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
  TablePagination,
  Chip,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
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
import { z } from 'zod';
import type { ReceivableDto, ReceivableStatus, ReceivablePaymentDto } from '@farmacia/contracts';
import {
  fetchReceivables,
  fetchReceivableById,
  fetchReceivablesAgingSummary,
  registerReceivablePayment,
  revertReceivablePayment,
} from '../api/receivables.api';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { useBankAccountOptions } from '../../treasury/hooks/useTreasury';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

// ============================================================
// Schema de validación para el formulario de abono
// ============================================================

const paymentSchema = z.object({
  amount: z
    .string()
    .min(1, 'Ingresa el monto')
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, 'El monto debe ser mayor a cero'),
  paymentMethod: z.enum(['EFECTIVO', 'TRANSFERENCIA']),
  bankAccountId: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => data.paymentMethod !== 'TRANSFERENCIA' || Boolean(data.bankAccountId), {
  path: ['bankAccountId'],
  message: 'Selecciona la cuenta que recibe la transferencia',
});

type PaymentFormData = z.infer<typeof paymentSchema>;

// ============================================================
// Status chips
// ============================================================

const statusConfig: Record<
  ReceivableStatus,
  { label: string; color: 'warning' | 'success' | 'error' | 'default' }
> = {
  PENDIENTE: { label: 'Pendiente', color: 'warning' },
  PAGADA: { label: 'Pagada', color: 'success' },
  ANULADA: { label: 'Anulada', color: 'error' },
};

const isOverdue = (dueDate: string, status: ReceivableStatus) =>
  status === 'PENDIENTE' && new Date(dueDate) < new Date();

// ============================================================
// Modal de detalle y abono
// ============================================================

interface PaymentModalProps {
  receivable: ReceivableDto;
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentModal({ receivable, onClose, onSuccess }: PaymentModalProps) {
  const queryClient = useQueryClient();
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  const { data: detail } = useQuery({
    queryKey: ['receivable-detail', receivable.id],
    queryFn: () => fetchReceivableById(receivable.id),
    initialData: receivable,
  });

  const [reversalTarget, setReversalTarget] = useState<ReceivablePaymentDto | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PaymentFormData | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: '', paymentMethod: 'EFECTIVO', bankAccountId: '', notes: '' },
  });
  const paymentMethod = watch('paymentMethod');
  const bankAccounts = useBankAccountOptions(paymentMethod === 'TRANSFERENCIA');

  const mutation = useMutation({
    mutationFn: (data: PaymentFormData) => {
      const fingerprint = JSON.stringify(data);
      if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
      return registerReceivablePayment(receivable.id, {
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        bankAccountId: data.paymentMethod === 'TRANSFERENCIA' ? data.bankAccountId : undefined,
        notes: data.notes || null,
      }, retry.current.key);
    },
    onSuccess: () => {
      retry.current = null;
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['receivable-detail', receivable.id] });
      queryClient.invalidateQueries({ queryKey: ['receivables-aging'] });
      reset();
      onSuccess();
    },
  });

  const reverseMutation = useMutation({
    mutationFn: () => {
      if (!reversalTarget) throw new Error('No se seleccionó abono para revertir');
      return revertReceivablePayment(receivable.id, reversalTarget.id, { reason: reversalReason });
    },
    onSuccess: () => {
      setReversalTarget(null);
      setReversalReason('');
      setReversalError(null);
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['receivable-detail', receivable.id] });
      queryClient.invalidateQueries({ queryKey: ['receivables-aging'] });
    },
    onError: (err: Error) => {
      setReversalError(err.message || 'Error al revertir el abono.');
    },
  });

  const balance = Number(detail?.balance ?? receivable.balance);
  const canPay = detail?.status === 'PENDIENTE' && balance > 0;

  return (
    <Dialog
      open
      onClose={onClose}
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
          <Paper
            variant="outlined"
            sx={{ flex: 1, p: 1.5, textAlign: 'center', borderRadius: 2 }}
          >
            <Typography variant="caption" color="text.secondary">Total</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              ${Number(detail?.totalAmount ?? receivable.totalAmount).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
            </Typography>
          </Paper>
          <Paper
            variant="outlined"
            sx={{ flex: 1, p: 1.5, textAlign: 'center', borderRadius: 2 }}
          >
            <Typography variant="caption" color="text.secondary">Pagado</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
              ${Number(detail?.amountPaid ?? receivable.amountPaid).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
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
            <Typography variant="caption" color="text.secondary">Saldo</Typography>
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
          <Typography variant="body2" color="text.secondary">Vence:</Typography>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: isOverdue(detail?.dueDate ?? receivable.dueDate, detail?.status ?? receivable.status) ? 'error.main' : 'text.primary',
            }}
          >
            {new Date((detail?.dueDate ?? receivable.dueDate) + 'T12:00:00').toLocaleDateString('es-CO', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
            {isOverdue(detail?.dueDate ?? receivable.dueDate, detail?.status ?? receivable.status) && ' ⚠ Vencida'}
          </Typography>
          <Chip
            size="small"
            label={statusConfig[detail?.status ?? receivable.status].label}
            color={statusConfig[detail?.status ?? receivable.status].color}
          />
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* Registro Histórico de Abonos */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}>
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
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Valor Abonado</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Método</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Observaciones</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>Estado / Acción</TableCell>
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
                              <Chip label="Revertido" size="small" color="error" variant="outlined" />
                              {p.reversalReason && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
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
                                setReversalReason('');
                                setReversalError(null);
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
          <Box component="form" id="payment-form" onSubmit={handleSubmit((d) => setPendingPayment(d))}>
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
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Monto del abono"
                    type="number"
                    slotProps={{
                      htmlInput: { min: 0.01, max: balance, step: 0.01 },
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                    }}
                    error={!!errors.amount}
                    helperText={errors.amount?.message ?? `Saldo pendiente máximo a abonar: $${balance.toLocaleString('es-CO', { minimumFractionDigits: 2 })}`}
                    size="small"
                    autoFocus
                  />
                )}
              />

              <Controller
                name="paymentMethod"
                control={control}
                render={({ field }) => (
                  <FormControl size="small" error={!!errors.paymentMethod}>
                    <InputLabel>Método de pago</InputLabel>
                    <Select {...field} label="Método de pago">
                      <MenuItem value="EFECTIVO">Efectivo</MenuItem>
                      <MenuItem value="TRANSFERENCIA">Transferencia</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />

              {paymentMethod === 'TRANSFERENCIA' && (
                <Controller
                  name="bankAccountId"
                  control={control}
                  render={({ field }) => (
                    <FormControl size="small" required error={!!errors.bankAccountId || bankAccounts.isError}>
                      <InputLabel id="receivable-bank-account-label">Cuenta que recibe</InputLabel>
                      <Select {...field} labelId="receivable-bank-account-label" label="Cuenta que recibe" disabled={bankAccounts.isPending || bankAccounts.isError}>
                        {(bankAccounts.data ?? []).map((account) => (
                          <MenuItem key={account.id} value={account.id}>{account.name} · {account.bankName}{account.accountNumberLast4 ? ` ···${account.accountNumberLast4}` : ''}</MenuItem>
                        ))}
                      </Select>
                      {(errors.bankAccountId || bankAccounts.isError) && (
                        <Alert severity="error">{errors.bankAccountId?.message ?? 'No se pudieron consultar las cuentas bancarias.'}</Alert>
                      )}
                    </FormControl>
                  )}
                />
              )}

              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
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

        {!canPay && (
          <Alert severity={detail?.status === 'PAGADA' ? 'success' : 'info'}>
            {detail?.status === 'PAGADA'
              ? 'Esta cuenta por cobrar se encuentra totalmente pagada (saldo $0,00).'
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
      <Dialog
        open={Boolean(reversalTarget)}
        onClose={() => !reverseMutation.isPending && setReversalTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Revertir Abono de Cliente</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            ¿Estás seguro de anular el abono por{' '}
            <strong>
              ${Number(reversalTarget?.amount ?? 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
            </strong>{' '}
            ({reversalTarget?.paymentMethod})? El saldo de la cuenta por cobrar aumentará nuevamente y se registrará un egreso compensatorio en caja o bancos.
          </Typography>

          <TextField
            label="Motivo de la anulación"
            placeholder="Ej: Error en valor digitado, cheque rechazado, etc."
            fullWidth
            size="small"
            required
            multiline
            rows={2}
            value={reversalReason}
            onChange={(e) => setReversalReason(e.target.value)}
            error={reversalReason.trim().length > 0 && reversalReason.trim().length < 5}
            helperText={
              reversalReason.trim().length > 0 && reversalReason.trim().length < 5
                ? 'El motivo debe tener al menos 5 caracteres'
                : 'Mínimo 5 caracteres'
            }
          />

          {reversalError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {reversalError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setReversalTarget(null)}
            disabled={reverseMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => reverseMutation.mutate()}
            disabled={reverseMutation.isPending || reversalReason.trim().length < 5}
          >
            {reverseMutation.isPending ? 'Anulando…' : 'Confirmar Anulación'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Confirmación: Registrar Abono */}
      <ConfirmDialog
        open={Boolean(pendingPayment)}
        onClose={() => setPendingPayment(null)}
        onConfirm={() => {
          if (pendingPayment) {
            const data = pendingPayment;
            setPendingPayment(null);
            mutation.mutate(data);
          }
        }}
        isLoading={mutation.isPending}
        title="Confirmar Registro de Abono"
        description={
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              ¿Estás seguro de registrar un abono por{' '}
              <strong>${Number(pendingPayment?.amount || 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}</strong>?
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

// ============================================================
// Página principal: UX-21 Lista de Cuentas por Cobrar
// ============================================================

export function ReceivablesPage() {
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReceivableStatus | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedReceivable, setSelectedReceivable] = useState<ReceivableDto | null>(null);

  const { data: agingData } = useQuery({
    queryKey: ['receivables-aging'],
    queryFn: () => fetchReceivablesAgingSummary(),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['receivables', page, statusFilter, overdueOnly, fromDate, toDate],
    queryFn: () =>
      fetchReceivables({
        status: statusFilter || undefined,
        overdueOnly: overdueOnly || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page: page + 1,
        pageSize,
      }),
    placeholderData: (prev) => prev,
  });

  const handlePaymentSuccess = useCallback(() => {
    // Mantener el modal abierto para ver la actualización del saldo
  }, []);

  const filteredItems = (data?.items ?? []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.customerName ?? '').toLowerCase().includes(q) ||
      (r.invoiceNumber ?? '').toLowerCase().includes(q)
    );
  });

  const hasActiveFilters = Boolean(
    search || statusFilter || overdueOnly || fromDate || toDate,
  );

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <HomeBackButton />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Cuentas por Cobrar
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestión y seguimiento de cartera, abonos y créditos comerciales de clientes.
          </Typography>
        </Box>
      </Box>

      {/* Aging KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Total en Cartera
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'text.primary' }}>
            ${Number(agingData?.totalPending ?? 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Saldo acumulado ({agingData?.totalCount ?? 0} créditos)
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'success.50', borderColor: 'success.200' }}>
          <Typography variant="caption" color="success.dark" sx={{ fontWeight: 600 }}>
            Al Día / Corriente
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'success.dark' }}>
            ${Number(agingData?.current.amount ?? 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {agingData?.current.count ?? 0} crédito(s)
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'warning.50', borderColor: 'warning.200' }}>
          <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 600 }}>
            Vencidas 1 - 30 Días
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'warning.dark' }}>
            ${Number(agingData?.days1To30.amount ?? 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {agingData?.days1To30.count ?? 0} crédito(s)
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'warning.100', borderColor: 'warning.300' }}>
          <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 600 }}>
            Vencidas 31 - 60 Días
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'warning.dark' }}>
            ${Number(agingData?.days31To60.amount ?? 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {agingData?.days31To60.count ?? 0} crédito(s)
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'error.50', borderColor: 'error.200' }}>
          <Typography variant="caption" color="error.dark" sx={{ fontWeight: 600 }}>
            Vencidas &gt; 60 Días
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'error.dark' }}>
            ${(Number(agingData?.days61To90.amount ?? 0) + Number(agingData?.daysOver90.amount ?? 0)).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {(agingData?.days61To90.count ?? 0) + (agingData?.daysOver90.count ?? 0)} crédito(s)
          </Typography>
        </Paper>
      </Box>

      {/* Filtros */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}>
          <TextField
            id="receivables-search"
            placeholder="Buscar cliente o factura…"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 220 }}
          />

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="receivables-status-label">Estado</InputLabel>
            <Select
              labelId="receivables-status-label"
              id="receivables-status"
              value={statusFilter}
              label="Estado"
              onChange={(e) => {
                setStatusFilter(e.target.value as ReceivableStatus | '');
                setPage(0);
              }}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="PENDIENTE">Pendiente</MenuItem>
              <MenuItem value="PAGADA">Pagada</MenuItem>
              <MenuItem value="ANULADA">Anulada</MenuItem>
            </Select>
          </FormControl>

          <TextField
            id="receivables-from-date"
            label="Desde"
            type="date"
            size="small"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(0);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 140 }}
          />

          <TextField
            id="receivables-to-date"
            label="Hasta"
            type="date"
            size="small"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(0);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 140 }}
          />

          <Button
            variant={overdueOnly ? 'contained' : 'outlined'}
            color="warning"
            size="small"
            onClick={() => {
              setOverdueOnly((v) => !v);
              setPage(0);
            }}
          >
            Solo vencidas
          </Button>

          {hasActiveFilters && (
            <Button
              size="small"
              color="inherit"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setStatusFilter('');
                setOverdueOnly(false);
                setSearch('');
                setPage(0);
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Tabla */}
      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 700 }}>Factura</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Cliente</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Pagado</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Saldo</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Vence</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Acción</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {isError && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Alert severity="error">Error al cargar las cuentas por cobrar</Alert>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filteredItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No se encontraron cuentas por cobrar
                  </TableCell>
                </TableRow>
              )}
              {filteredItems.map((r) => {
                const overdue = isOverdue(r.dueDate, r.status);
                const cfg = statusConfig[r.status];
                return (
                  <TableRow
                    key={r.id}
                    hover
                    sx={{
                      bgcolor: overdue ? 'error.50' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedReceivable(r)}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {r.invoiceNumber ?? '—'}
                    </TableCell>
                    <TableCell>{r.customerName ?? '—'}</TableCell>
                    <TableCell>
                      ${Number(r.totalAmount).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell sx={{ color: 'success.main', fontWeight: 600 }}>
                      ${Number(r.amountPaid).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: r.status === 'PENDIENTE' ? 'warning.dark' : 'text.secondary',
                      }}
                    >
                      ${Number(r.balance).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          color: overdue ? 'error.main' : 'text.primary',
                          fontWeight: overdue ? 700 : 400,
                        }}
                      >
                        {new Date(r.dueDate + 'T12:00:00').toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={cfg.label}
                        color={cfg.color}
                      />
                    </TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          color="info"
                          onClick={() => setSelectedReceivable(r)}
                          id={`receivable-history-${r.id}`}
                          sx={{ textTransform: 'none', minWidth: 90, fontSize: '0.75rem' }}
                        >
                          Ver Abonos
                        </Button>
                        {r.status === 'PENDIENTE' ? (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            onClick={() => setSelectedReceivable(r)}
                            id={`receivable-action-${r.id}`}
                            sx={{ textTransform: 'none', minWidth: 75, fontSize: '0.75rem' }}
                          >
                            Abonar
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="text"
                            color="inherit"
                            onClick={() => setSelectedReceivable(r)}
                            id={`receivable-action-${r.id}`}
                            sx={{ textTransform: 'none', minWidth: 70, fontSize: '0.75rem' }}
                          >
                            Detalle
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={data?.total ?? 0}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[pageSize]}
          labelDisplayedRows={({ from, to, count }) =>
            `${from}–${to} de ${count !== -1 ? count : `+${to}`}`
          }
        />
      </Paper>

      {/* Modal de abono */}
      {selectedReceivable && (
        <PaymentModal
          receivable={selectedReceivable}
          onClose={() => setSelectedReceivable(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </Box>
  );
}
