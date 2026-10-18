import { useState, useCallback } from 'react';
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Stack,
  Alert,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import type { PayableDto, PayableStatus } from '@farmacia/contracts';
import { fetchPayables, fetchPayablesAgingSummary } from '../api/payables.api';
import { HomeBackButton } from '../../../components/HomeBackButton';

import { PayablePaymentDialog } from '../components/PayablePaymentDialog';
import { statusConfig, isOverdue } from '../utils/status';

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

  const hasActiveFilters = Boolean(search || statusFilter || overdueOnly || fromDate || toDate);

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
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(6, 1fr)',
          },
          gap: 2,
          mb: 3,
        }}
      >
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Total Pendiente
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'text.primary' }}>
            $
            {Number(agingData?.totalPending ?? 0).toLocaleString('es-CO', {
              minimumFractionDigits: 2,
            })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Saldo acumulado ({agingData?.totalCount ?? 0} facturas)
          </Typography>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: 2, borderRadius: 2, bgcolor: 'success.50', borderColor: 'success.200' }}
        >
          <Typography variant="caption" color="success.dark" sx={{ fontWeight: 600 }}>
            Al Día / Corriente
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'success.dark' }}>
            $
            {Number(agingData?.current.amount ?? 0).toLocaleString('es-CO', {
              minimumFractionDigits: 2,
            })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {agingData?.current.count ?? 0} factura(s)
          </Typography>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: 2, borderRadius: 2, bgcolor: 'warning.50', borderColor: 'warning.200' }}
        >
          <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 600 }}>
            Vencidas 1 - 30 Días
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'warning.dark' }}>
            $
            {Number(agingData?.days1To30.amount ?? 0).toLocaleString('es-CO', {
              minimumFractionDigits: 2,
            })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {agingData?.days1To30.count ?? 0} factura(s)
          </Typography>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: 2, borderRadius: 2, bgcolor: 'warning.100', borderColor: 'warning.300' }}
        >
          <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 600 }}>
            Vencidas 31 - 60 Días
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'warning.dark' }}>
            $
            {Number(agingData?.days31To60.amount ?? 0).toLocaleString('es-CO', {
              minimumFractionDigits: 2,
            })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {agingData?.days31To60.count ?? 0} factura(s)
          </Typography>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: 2, borderRadius: 2, bgcolor: 'error.50', borderColor: 'error.200' }}
        >
          <Typography variant="caption" color="error.dark" sx={{ fontWeight: 600 }}>
            Vencidas 61 - 90 Días
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'error.dark' }}>
            $
            {Number(agingData?.days61To90.amount ?? 0).toLocaleString('es-CO', {
              minimumFractionDigits: 2,
            })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {agingData?.days61To90.count ?? 0} factura(s)
          </Typography>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ p: 2, borderRadius: 2, bgcolor: 'error.100', borderColor: 'error.400' }}
        >
          <Typography variant="caption" color="error.dark" sx={{ fontWeight: 700 }}>
            &gt; 90 Días (Cartera Crítica)
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'error.dark' }}>
            $
            {Number(agingData?.daysOver90.amount ?? 0).toLocaleString('es-CO', {
              minimumFractionDigits: 2,
            })}
          </Typography>
          <Typography variant="caption" color="error.dark" sx={{ fontWeight: 600 }}>
            {agingData?.daysOver90.count ?? 0} factura(s)
          </Typography>
        </Paper>
      </Box>

      {/* Filtros */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}
        >
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
                <TableCell align="center" sx={{ fontWeight: 700 }}>
                  Acción
                </TableCell>
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
              {!isLoading && !isError && filteredItems.length === 0 && (
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
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        color: p.status === 'PENDIENTE' ? 'error.dark' : 'text.secondary',
                      }}
                    >
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
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
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
        <PayablePaymentDialog
          payable={selectedPayable}
          onClose={() => setSelectedPayable(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </Box>
  );
}
