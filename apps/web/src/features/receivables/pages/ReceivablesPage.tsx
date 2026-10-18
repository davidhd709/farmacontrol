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

import { type ReceivableDto, type ReceivableStatus } from '@farmacia/contracts';
import { fetchReceivables, fetchReceivablesAgingSummary } from '../api/receivables.api';
import { HomeBackButton } from '../../../components/HomeBackButton';

import { ReceivablePaymentDialog } from '../components/ReceivablePaymentDialog';
import { isOverdue, getStatusDisplay } from '../utils/status';

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

  const hasActiveFilters = Boolean(search || statusFilter || overdueOnly || fromDate || toDate);

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
            Total en Cartera
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: 'text.primary' }}>
            $
            {Number(agingData?.totalPending ?? 0).toLocaleString('es-CO', {
              minimumFractionDigits: 2,
            })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Saldo acumulado ({agingData?.totalCount ?? 0} créditos)
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
            {agingData?.current.count ?? 0} crédito(s)
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
            {agingData?.days1To30.count ?? 0} crédito(s)
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
            {agingData?.days31To60.count ?? 0} crédito(s)
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
            {agingData?.days61To90.count ?? 0} crédito(s)
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
            {agingData?.daysOver90.count ?? 0} crédito(s)
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
                <TableCell align="center" sx={{ fontWeight: 700 }}>
                  Acción
                </TableCell>
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
              {!isLoading && !isError && filteredItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No se encontraron cuentas por cobrar
                  </TableCell>
                </TableRow>
              )}
              {filteredItems.map((r) => {
                const overdue = isOverdue(r.dueDate, r.status);
                const cfg = getStatusDisplay(r.status);
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
                      <Chip size="small" label={cfg.label} color={cfg.color} />
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
        <ReceivablePaymentDialog
          receivable={selectedReceivable}
          onClose={() => setSelectedReceivable(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </Box>
  );
}
