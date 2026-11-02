import { useState } from 'react';
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

import { SYSTEM_PERMISSIONS, type ReceivableStatus } from '@farmacia/contracts';
import { fetchReceivables, fetchReceivablesAgingSummary } from '../api/receivables.api';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { AgingSummaryCards } from '../../../components/AgingSummaryCards';

import { ReceivableMovementsDialog } from '../components/ReceivableMovementsDialog';
import { VoucherFormDialog } from '../../treasury/components/VoucherFormDialog';
import { PermissionGate } from '../../auth/components/PermissionGate';
import { formatMoney, toCents } from '../../../utils/money';
import { isOverdue, getStatusDisplay } from '../utils/status';

export function ReceivablesPage() {
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReceivableStatus | ''>('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [movementsReceivableId, setMovementsReceivableId] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null);

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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <HomeBackButton />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Cuentas por Cobrar
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gestión y seguimiento de cartera, abonos y créditos comerciales de clientes.
          </Typography>
        </Box>
        {/* El abono se registra con un recibo de caja (recibo_caja.crear_abono) */}
        <PermissionGate permission={SYSTEM_PERMISSIONS.CASH_RECEIPTS_COLLECT}>
          <Button variant="contained" onClick={() => setReceiptOpen(true)} sx={{ fontWeight: 600 }}>
            Nuevo recibo de caja
          </Button>
        </PermissionGate>
      </Box>
      {receiptNotice && (
        <Alert severity="success" onClose={() => setReceiptNotice(null)} sx={{ mb: 2 }}>
          {receiptNotice}
        </Alert>
      )}

      {/* Cartera por edades: los mismos rangos que cuentas por pagar */}
      {agingData && (
        <Box sx={{ mb: 3 }}>
          <AgingSummaryCards aging={agingData} />
        </Box>
      )}

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
                    onClick={() => setMovementsReceivableId(r.id)}
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
                          onClick={() => setMovementsReceivableId(r.id)}
                          id={`receivable-history-${r.id}`}
                          sx={{ textTransform: 'none', minWidth: 90, fontSize: '0.75rem' }}
                        >
                          Ver Abonos
                        </Button>
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
      {movementsReceivableId && (
        <ReceivableMovementsDialog
          receivableId={movementsReceivableId}
          onClose={() => setMovementsReceivableId(null)}
        />
      )}

      <VoucherFormDialog
        type="RECIBO_CAJA"
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        onCreated={(document) => {
          setReceiptOpen(false);
          setReceiptNotice(
            `Recibo de caja ${document.documentNumber} registrado por ${formatMoney(toCents(document.amount))}.`,
          );
        }}
      />
    </Box>
  );
}
