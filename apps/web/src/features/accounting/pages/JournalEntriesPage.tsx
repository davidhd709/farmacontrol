import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS, type JournalEntryDto } from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import {
  fetchJournalEntries,
  fetchJournalEntryById,
  reverseJournalEntry,
} from '../api/accounting.api';

const sourceTypeLabels: Record<string, { label: string; color: 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'default' }> = {
  SALE: { label: 'Venta', color: 'success' },
  PURCHASE: { label: 'Compra', color: 'primary' },
  RECEIVABLE_PAYMENT: { label: 'Cobro Cartera', color: 'info' },
  PAYABLE_PAYMENT: { label: 'Pago Proveedor', color: 'warning' },
  REVERSAL: { label: 'Reversión', color: 'secondary' },
};

export const JournalEntriesPage = () => {
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [search, setSearch] = useState('');

  // Modales
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [reversingEntry, setReversingEntry] = useState<JournalEntryDto | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalDate, setReversalDate] = useState(new Date().toISOString().slice(0, 10));
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['journal-entries', page, pageSize, fromDate, toDate, sourceType, search],
    queryFn: () =>
      fetchJournalEntries({
        page: page + 1,
        pageSize,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        sourceType: sourceType || undefined,
        search: search || undefined,
      }),
  });

  const { data: entryDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['journal-entry-detail', selectedEntryId],
    queryFn: () => (selectedEntryId ? fetchJournalEntryById(selectedEntryId) : null),
    enabled: Boolean(selectedEntryId),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ id, reason, date }: { id: string; reason: string; date: string }) =>
      reverseJournalEntry(id, { reason, entryDate: date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      setReversingEntry(null);
      setReversalReason('');
      setActionError(null);
      if (selectedEntryId) {
        queryClient.invalidateQueries({ queryKey: ['journal-entry-detail', selectedEntryId] });
      }
    },
    onError: (err: any) => {
      setActionError(err.message || 'Error al reversar el comprobante.');
    },
  });

  if (!hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_READ)) {
    return (
      <Container component="main" sx={{ py: 4 }}>
        <Alert severity="warning">No tienes permiso para consultar el Libro Diario.</Alert>
      </Container>
    );
  }

  const handleOpenReverse = (entry: JournalEntryDto) => {
    setReversingEntry(entry);
    setReversalDate(new Date().toISOString().slice(0, 10));
    setReversalReason('');
    setActionError(null);
  };

  const handleConfirmReverse = () => {
    if (!reversingEntry) return;
    if (!reversalReason.trim()) {
      setActionError('El motivo de la reversión es obligatorio.');
      return;
    }
    reverseMutation.mutate({
      id: reversingEntry.id,
      reason: reversalReason.trim(),
      date: reversalDate,
    });
  };

  return (
    <Container component="main" maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        {/* Cabecera */}
        <Box>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
            Libro Diario
          </Typography>
          <Typography color="text.secondary">
            Registro cronológico inmutable de comprobantes contables y motor de partida doble.
          </Typography>
        </Box>

        {/* Barra de Filtros */}
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
            <TextField
              label="Desde"
              type="date"
              size="small"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 150 }}
            />
            <TextField
              label="Hasta"
              type="date"
              size="small"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 150 }}
            />
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Origen</InputLabel>
              <Select
                value={sourceType}
                label="Origen"
                onChange={(e) => setSourceType(e.target.value)}
              >
                <MenuItem value="">Todos los orígenes</MenuItem>
                <MenuItem value="SALE">Ventas (POS)</MenuItem>
                <MenuItem value="PURCHASE">Compras</MenuItem>
                <MenuItem value="RECEIVABLE_PAYMENT">Cobro de Cartera</MenuItem>
                <MenuItem value="PAYABLE_PAYMENT">Pago Proveedores</MenuItem>
                <MenuItem value="REVERSAL">Reversiones</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Buscar descripción o documento"
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <Button
              variant="outlined"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setSourceType('');
                setSearch('');
                setPage(0);
              }}
            >
              Limpiar
            </Button>
            <Button variant="contained" onClick={() => refetch()}>
              Filtrar
            </Button>
          </Stack>
        </Paper>

        {/* Tabla de Asientos */}
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : isError ? (
            <Alert severity="error" sx={{ m: 2 }}>
              Error al cargar los comprobantes contables.
            </Alert>
          ) : (
            <>
              <TableContainer sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Origen</TableCell>
                      <TableCell>Documento Ref.</TableCell>
                      <TableCell>Descripción</TableCell>
                      <TableCell align="right">Débito Total</TableCell>
                      <TableCell align="right">Crédito Total</TableCell>
                      <TableCell align="center">Estado</TableCell>
                      <TableCell align="center">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data?.items && data.items.length > 0 ? (
                      data.items.map((entry) => {
                        const origin = sourceTypeLabels[entry.sourceType] ?? {
                          label: entry.sourceType,
                          color: 'default',
                        };
                        const isReversal = Boolean(entry.reversalOfId);

                        return (
                          <TableRow key={entry.id} hover>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry.entryDate}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={origin.label}
                                color={origin.color}
                                variant={isReversal ? 'filled' : 'outlined'}
                              />
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                              {entry.sourceId ? entry.sourceId.slice(0, 16) : '-'}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 350 }}>
                              <Typography variant="body2" noWrap title={entry.description}>
                                {entry.description}
                              </Typography>
                              {entry.reversalReason && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                  Motivo: {entry.reversalReason}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              ${Number(entry.totalDebit).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              ${Number(entry.totalCredit).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                size="small"
                                label={isReversal ? 'REVERSIÓN' : entry.status}
                                color={isReversal ? 'secondary' : 'success'}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => setSelectedEntryId(entry.id)}
                                >
                                  Detalle
                                </Button>
                                {hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE) &&
                                  !isReversal &&
                                  entry.sourceType !== 'REVERSAL' && (
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="warning"
                                      onClick={() => handleOpenReverse(entry)}
                                    >
                                      Reversar
                                    </Button>
                                  )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                          No se encontraron comprobantes contables registrados.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[10, 20, 50, 100]}
                component="div"
                count={data?.total ?? 0}
                rowsPerPage={pageSize}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                labelRowsPerPage="Filas por página:"
              />
            </>
          )}
        </Paper>
      </Stack>

      {/* Modal de Detalle del Comprobante */}
      <Dialog
        open={Boolean(selectedEntryId)}
        onClose={() => setSelectedEntryId(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Detalle del Comprobante Contable
        </DialogTitle>
        <DialogContent dividers>
          {isLoadingDetail ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : entryDetail ? (
            <Stack spacing={2.5}>
              <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {entryDetail.description}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Fecha:</strong> {entryDetail.entryDate}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Origen:</strong> {entryDetail.sourceType}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Usuario:</strong> {entryDetail.createdByName || 'Sistema'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Estado:</strong> {entryDetail.status}
                  </Typography>
                </Stack>
                {entryDetail.reversalOfId && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Este asiento es una reversión del comprobante <code>{entryDetail.reversalOfId}</code>.
                    {entryDetail.reversalReason && ` Motivo: ${entryDetail.reversalReason}`}
                  </Alert>
                )}
              </Box>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell>#</TableCell>
                      <TableCell>Código</TableCell>
                      <TableCell>Cuenta</TableCell>
                      <TableCell>Propósito</TableCell>
                      <TableCell>Descripción</TableCell>
                      <TableCell align="right">Débito</TableCell>
                      <TableCell align="right">Crédito</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entryDetail.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.position}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {l.accountCode || '-'}
                        </TableCell>
                        <TableCell>{l.accountName || '-'}</TableCell>
                        <TableCell>
                          {l.purpose ? (
                            <Chip size="small" variant="outlined" label={l.purpose} />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{l.description || '-'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: Number(l.debit) > 0 ? 600 : 400 }}>
                          ${Number(l.debit).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: Number(l.credit) > 0 ? 600 : 400 }}>
                          ${Number(l.credit).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell colSpan={5} sx={{ fontWeight: 700, textAlign: 'right' }}>
                        TOTALES:
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        ${Number(entryDetail.totalDebit).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        ${Number(entryDetail.totalCredit).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          ) : (
            <Alert severity="error">No se pudo cargar el detalle del asiento.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedEntryId(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal de Confirmación de Reversión */}
      <Dialog
        open={Boolean(reversingEntry)}
        onClose={() => setReversingEntry(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Reversar Comprobante Contable
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="warning">
              Se creará un asiento de compensación inmutable invirtiendo exactamente los débitos y créditos del asiento original. Esta acción no se puede deshacer.
            </Alert>
            {actionError && <Alert severity="error">{actionError}</Alert>}
            <TextField
              label="Fecha de la Reversión"
              type="date"
              size="small"
              value={reversalDate}
              onChange={(e) => setReversalDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="Motivo obligatorio de la reversión"
              multiline
              rows={3}
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              fullWidth
              required
              placeholder="Explica la razón contable o administrativa de la reversión..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReversingEntry(null)} disabled={reverseMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmReverse}
            variant="contained"
            color="warning"
            disabled={reverseMutation.isPending}
          >
            {reverseMutation.isPending ? 'Reversando...' : 'Confirmar Reversión'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};
