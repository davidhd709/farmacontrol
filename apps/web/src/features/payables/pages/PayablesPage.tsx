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
  Collapse,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { PayableDto, PayableStatus } from '@farmacia/contracts';
import {
  fetchPayables,
  fetchPayableById,
  fetchPayablesAgingSummary,
  registerPayablePayment,
  revertPayablePayment,
} from '../api/payables.api';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { useBankAccountOptions } from '../../treasury/hooks/useTreasury';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

// ============================================================
// Schema
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
  message: 'Selecciona la cuenta desde la que se paga',
});

type PaymentFormData = z.infer<typeof paymentSchema>;

// ============================================================
// Status chips
// ============================================================

const statusConfig: Record<PayableStatus, { label: string; color: 'warning' | 'success' | 'error' | 'default' }> = {
  PENDIENTE: { label: 'Pendiente', color: 'warning' },
  PAGADA: { label: 'Pagada', color: 'success' },
  ANULADA: { label: 'Anulada', color: 'error' },
};

const isOverdue = (dueDate: string, status: PayableStatus) =>
  status === 'PENDIENTE' && new Date(dueDate) < new Date();

// ============================================================
// Modal de pago
// ============================================================

interface PaymentModalProps {
  payable: PayableDto;
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentModal({ payable, onClose, onSuccess }: PaymentModalProps) {
  const [showPayments, setShowPayments] = useState(false);
  const [reversalTarget, setReversalTarget] = useState<any | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PaymentFormData | null>(null);
  const queryClient = useQueryClient();
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  const { data: detail } = useQuery({
    queryKey: ['payable-detail', payable.id],
    queryFn: () => fetchPayableById(payable.id),
    initialData: payable,
  });

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
      return registerPayablePayment(payable.id, {
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        bankAccountId: data.paymentMethod === 'TRANSFERENCIA' ? data.bankAccountId : undefined,
        notes: data.notes || null,
      }, retry.current.key);
    },
    onSuccess: () => {
      retry.current = null;
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['payable-detail', payable.id] });
      queryClient.invalidateQueries({ queryKey: ['payables-aging'] });
      reset();
      onSuccess();
    },
  });

  const reverseMutation = useMutation({
    mutationFn: () => {
      if (!reversalTarget) throw new Error('No se seleccionó pago para revertir');
      return revertPayablePayment(payable.id, reversalTarget.id, { reason: reversalReason });
    },
    onSuccess: () => {
      setReversalTarget(null);
      setReversalReason('');
      setReversalError(null);
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['payable-detail', payable.id] });
      queryClient.invalidateQueries({ queryKey: ['payables-aging'] });
    },
    onError: (err: Error) => {
      setReversalError(err.message || 'Error al revertir el pago.');
    },
  });

  const balance = Number(detail?.balance ?? payable.balance);
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
            { label: 'Total', value: Number(detail?.totalAmount ?? payable.totalAmount), color: undefined },
            { label: 'Pagado', value: Number(detail?.amountPaid ?? payable.amountPaid), color: 'success.main' },
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
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color }}>
                ${value.toLocaleString('es-CO', { minimumFractionDigits: 2 })}
              </Typography>
            </Paper>
          ))}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">Vence:</Typography>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: isOverdue(detail?.dueDate ?? payable.dueDate, detail?.status ?? payable.status) ? 'error.main' : 'text.primary',
            }}
          >
            {new Date((detail?.dueDate ?? payable.dueDate) + 'T12:00:00').toLocaleDateString('es-CO', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
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
                        <TableCell>
                          {new Date(p.createdAt).toLocaleDateString('es-CO')}
                        </TableCell>
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
                              sx={{ textTransform: 'none' }}
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
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Collapse>
          </Box>
        )}

        {/* Diálogo de Confirmación de Reversión */}
        <Dialog
          open={Boolean(reversalTarget)}
          onClose={() => !reverseMutation.isPending && setReversalTarget(null)}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Revertir Pago al Proveedor</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Esta acción restituirá el saldo pendiente de la obligación y registrará una operación compensatoria en {reversalTarget?.paymentMethod === 'TRANSFERENCIA' ? 'el banco' : 'la caja'}.
            </Typography>
            {reversalError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {reversalError}
              </Alert>
            )}
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Motivo de la reversión"
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="Ej: Monto ingresado por error / Factura equivocada"
              multiline
              rows={2}
              required
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReversalTarget(null)} disabled={reverseMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => reverseMutation.mutate()}
              disabled={!reversalReason.trim() || reverseMutation.isPending}
            >
              {reverseMutation.isPending ? 'Revirtiendo…' : 'Confirmar Reversión'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Formulario */}
        {canPay && (
          <Box component="form" id="payable-payment-form" onSubmit={handleSubmit((d) => setPendingPayment(d))}>
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
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Monto del pago"
                    type="number"
                    slotProps={{
                      htmlInput: { min: 0.01, max: balance, step: 0.01 },
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                    }}
                    error={!!errors.amount}
                    helperText={errors.amount?.message ?? `Máximo: $${balance.toLocaleString('es-CO', { minimumFractionDigits: 2 })}`}
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
                      <InputLabel id="payable-bank-account-label">Cuenta de origen</InputLabel>
                      <Select {...field} labelId="payable-bank-account-label" label="Cuenta de origen" disabled={bankAccounts.isPending || bankAccounts.isError}>
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
          if (pendingPayment) {
            mutation.mutate(pendingPayment);
            setPendingPayment(null);
          }
        }}
        onCancel={() => setPendingPayment(null)}
      />
    </Dialog>
  );
}

// ============================================================
// Página: UX-23 Cuentas por Pagar
// ============================================================

export function PayablesPage() {
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PayableStatus | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedPayable, setSelectedPayable] = useState<PayableDto | null>(null);

  const { data: agingData } = useQuery({
    queryKey: ['payables-aging'],
    queryFn: () => fetchPayablesAgingSummary(),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payables', page, statusFilter, overdueOnly, fromDate, toDate],
    queryFn: () =>
      fetchPayables({
        status: statusFilter || undefined,
        overdueOnly: overdueOnly || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page: page + 1,
        pageSize,
      }),
    placeholderData: (prev) => prev,
  });

  const handlePaymentSuccess = useCallback(() => {}, []);

  const filteredItems = (data?.items ?? []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.supplierName ?? '').toLowerCase().includes(q) ||
      (p.invoiceNumber ?? '').toLowerCase().includes(q)
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
            Cuentas por Pagar
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Control de obligaciones comerciales, facturas pendientes y pagos a proveedores.
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
            Total Pendiente
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'text.primary' }}>
            ${Number(agingData?.totalPending ?? 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Saldo acumulado ({agingData?.totalCount ?? 0} facturas)
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
            {agingData?.current.count ?? 0} factura(s)
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
            {agingData?.days1To30.count ?? 0} factura(s)
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
            {agingData?.days31To60.count ?? 0} factura(s)
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
            {(agingData?.days61To90.count ?? 0) + (agingData?.daysOver90.count ?? 0)} factura(s)
          </Typography>
        </Paper>
      </Box>

      {/* Filtros */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}>
          <TextField
            id="payables-search"
            placeholder="Buscar proveedor o factura…"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 220 }}
          />

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="payables-status-label">Estado</InputLabel>
            <Select
              labelId="payables-status-label"
              id="payables-status"
              value={statusFilter}
              label="Estado"
              onChange={(e) => {
                setStatusFilter(e.target.value as PayableStatus | '');
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
            id="payables-from-date"
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
            id="payables-to-date"
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
            color="error"
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
                <TableCell sx={{ fontWeight: 700 }}>Proveedor</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Condición</TableCell>
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
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    Cargando…
                  </TableCell>
                </TableRow>
              )}
              {isError && (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Alert severity="error">Error al cargar las cuentas por pagar</Alert>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filteredItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No se encontraron cuentas por pagar
                  </TableCell>
                </TableRow>
              )}
              {filteredItems.map((p) => {
                const overdue = isOverdue(p.dueDate, p.status);
                const cfg = statusConfig[p.status];
                return (
                  <TableRow
                    key={p.id}
                    hover
                    sx={{ bgcolor: overdue ? 'error.50' : undefined, cursor: 'pointer' }}
                    onClick={() => setSelectedPayable(p)}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {p.invoiceNumber ?? '—'}
                    </TableCell>
                    <TableCell>{p.supplierName ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={p.paymentCondition ?? 'CRÉDITO'}
                        variant="outlined"
                        color={p.paymentCondition === 'CONTADO' ? 'info' : 'default'}
                        sx={{ fontSize: '0.75rem', height: 22 }}
                      />
                    </TableCell>
                    <TableCell>
                      ${Number(p.totalAmount).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell sx={{ color: 'success.main', fontWeight: 600 }}>
                      ${Number(p.amountPaid).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: p.status === 'PENDIENTE' ? 'error.dark' : 'text.secondary' }}>
                      ${Number(p.balance).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          color: overdue ? 'error.main' : 'text.primary',
                          fontWeight: overdue ? 700 : 400,
                        }}
                      >
                        {new Date(p.dueDate + 'T12:00:00').toLocaleDateString('es-CO', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={cfg.label} color={cfg.color} />
                    </TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="small"
                        variant={p.status === 'PENDIENTE' ? 'contained' : 'outlined'}
                        color={p.status === 'PENDIENTE' ? 'error' : 'inherit'}
                        onClick={() => setSelectedPayable(p)}
                        id={`payable-action-${p.id}`}
                        sx={{ textTransform: 'none', minWidth: 75 }}
                      >
                        {p.status === 'PENDIENTE' ? 'Pagar' : 'Detalle'}
                      </Button>
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

      {/* Modal */}
      {selectedPayable && (
        <PaymentModal
          payable={selectedPayable}
          onClose={() => setSelectedPayable(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </Box>
  );
}
