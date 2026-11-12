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
  Link,
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
import { Link as RouterLink } from 'react-router-dom';
import {
  SYSTEM_PERMISSIONS,
  getAccountingPurposeLabel,
  type JournalEntryDto,
} from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import {
  fetchJournalEntries,
  fetchJournalEntryById,
  annulJournalEntry,
} from '../api/accounting.api';
import { ManualNoteDialog } from '../components/ManualNoteDialog';
import { QuickDateRange, localIsoDate } from '../../../components/QuickDateRange';
import { formatDate } from '../../../utils/date-format';
import { FilterBar } from '../../../components/layout/FilterBar';
import { DateField } from '../../../components/DateField';
import PrintIcon from '@mui/icons-material/Print';
import { JournalEntryPrintDialog } from '../../../components/documents/JournalEntryPrintDialog';

const sourceTypeLabels: Record<
  string,
  { label: string; color: 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'default' }
> = {
  SALE: { label: 'Venta', color: 'success' },
  SALE_CANCEL: { label: 'Anulación de venta', color: 'secondary' },
  CREDIT_NOTE: { label: 'Devolución', color: 'warning' },
  CREDIT_NOTE_CANCEL: { label: 'Anulación de devolución', color: 'secondary' },
  PURCHASE: { label: 'Compra', color: 'primary' },
  DEBIT_NOTE: { label: 'Devolución a proveedor', color: 'primary' },
  RECEIVABLE_PAYMENT: { label: 'Cobro de cartera', color: 'info' },
  PAYABLE_PAYMENT: { label: 'Pago a proveedor', color: 'warning' },
  EXPENSE: { label: 'Causación', color: 'warning' },
  EXPENSE_PAYMENT: { label: 'Pago de causación', color: 'warning' },
  CASH_MOVEMENT: { label: 'Recibo / egreso de caja', color: 'info' },
  BANK_MOVEMENT: { label: 'Recibo / egreso bancario', color: 'info' },
  INVENTORY_ADJUSTMENT: { label: 'Ajuste de inventario', color: 'default' },
  INVENTORY_INITIAL: { label: 'Inventario inicial', color: 'default' },
  LOT_INITIAL: { label: 'Inventario inicial', color: 'default' },
  METHOD_CHANGE: { label: 'Cambio de método de costeo', color: 'default' },
  OPENING_BALANCE: { label: 'Saldos iniciales', color: 'default' },
  AUTO_OPENING: { label: 'Apertura', color: 'default' },
  FISCAL_CLOSING: { label: 'Cierre mensual', color: 'default' },
  ANNUAL_CLOSING: { label: 'Cierre anual', color: 'default' },
  REVERSAL: { label: 'Anulación', color: 'secondary' },
  MANUAL_NOTE: { label: 'Nota contable', color: 'default' },
};

/** Estado del asiento en palabras del usuario (no se depende solo del color). */
function statusOf(entry: JournalEntryDto): {
  label: string;
  color: 'success' | 'secondary' | 'default';
} {
  if (entry.reversalOfId) return { label: 'Anulación', color: 'secondary' };
  if (entry.reversedByEntryId) return { label: 'Anulado', color: 'default' };
  return entry.status === 'POSTED'
    ? { label: 'Contabilizado', color: 'success' }
    : { label: 'Borrador', color: 'default' };
}

const originOf = (sourceType: string) =>
  sourceTypeLabels[sourceType] ?? { label: 'Otro documento', color: 'default' as const };

/** Documento de origen legible, con enlace a la pantalla donde se consulta. */
function SourceDocument({ entry }: { entry: JournalEntryDto }) {
  const doc = entry.sourceDocument;
  if (!doc) return <>—</>;
  return doc.href ? (
    <Link component={RouterLink} to={doc.href} underline="hover" sx={{ fontWeight: 600 }}>
      {doc.number}
    </Link>
  ) : (
    <Box component="span" sx={{ fontWeight: 600 }}>
      {doc.number}
    </Box>
  );
}

/**
 * Asientos que se anulan desde su detalle (no nacen de un documento). Los de ventas,
 * devoluciones, recibos, egresos y causaciones se corrigen anulando el documento de origen.
 */
const ANNULLABLE_SOURCES = ['MANUAL_NOTE', 'OPENING_BALANCE', 'ANNUAL_CLOSING'];

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
  const [printEntryId, setPrintEntryId] = useState<string | null>(null);
  const [annullingEntry, setAnnullingEntry] = useState<JournalEntryDto | null>(null);
  const [annulReason, setAnnulReason] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [createdNote, setCreatedNote] = useState<string | null>(null);
  const [annulDate, setAnnulDate] = useState(localIsoDate(new Date()));
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

  const { data: printEntryDetail } = useQuery({
    queryKey: ['journal-entry-print-detail', printEntryId],
    queryFn: () => (printEntryId ? fetchJournalEntryById(printEntryId) : null),
    enabled: Boolean(printEntryId),
  });

  const annulMutation = useMutation({
    mutationFn: ({ id, reason, date }: { id: string; reason: string; date: string }) =>
      annulJournalEntry(id, { reason, entryDate: date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
      setAnnullingEntry(null);
      setAnnulReason('');
      setActionError(null);
      if (selectedEntryId) {
        queryClient.invalidateQueries({ queryKey: ['journal-entry-detail', selectedEntryId] });
      }
    },
    onError: (err: any) => {
      setActionError(err.message || 'No se pudo anular el asiento.');
    },
  });

  if (!hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_READ)) {
    return (
      <Container component="main" sx={{ py: { xs: 1, md: 2 } }}>
        <Alert severity="warning">No tienes permiso para consultar el Libro Diario.</Alert>
      </Container>
    );
  }

  const handleOpenAnnul = (entry: JournalEntryDto) => {
    setAnnullingEntry(entry);
    setAnnulDate(localIsoDate(new Date()));
    setAnnulReason('');
    setActionError(null);
  };

  const handleConfirmAnnul = () => {
    if (!annullingEntry) return;
    if (!annulReason.trim()) {
      setActionError('El motivo de la anulación es obligatorio.');
      return;
    }
    annulMutation.mutate({
      id: annullingEntry.id,
      reason: annulReason.trim(),
      date: annulDate,
    });
  };

  const canAnnul = (entry: JournalEntryDto) =>
    hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE) &&
    ANNULLABLE_SOURCES.includes(entry.sourceType) &&
    !entry.reversalOfId &&
    !entry.reversedByEntryId;

  return (
    <Container component="main" maxWidth="xl" sx={{ py: { xs: 1, md: 2 } }}>
      <Stack spacing={3}>
        {/* Cabecera */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
              Libro Diario
            </Typography>
            <Typography color="text.secondary">
              Registro cronológico de los asientos contables generados por los documentos del
              sistema.
            </Typography>
          </Box>
          {hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE) && (
            <Button variant="contained" onClick={() => setNoteOpen(true)}>
              Nueva nota contable
            </Button>
          )}
        </Box>
        {createdNote && (
          <Alert severity="success" onClose={() => setCreatedNote(null)}>
            Nota contable {createdNote} registrada.
          </Alert>
        )}
        <ManualNoteDialog
          open={noteOpen}
          onClose={() => setNoteOpen(false)}
          onCreated={(noteNumber) => {
            setNoteOpen(false);
            setCreatedNote(noteNumber);
            queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
            queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
          }}
        />

        {/* Barra de Filtros */}
        <FilterBar
          onSubmit={() => refetch()}
          actions={
            <>
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
              <Button type="submit" variant="contained">
                Filtrar
              </Button>
            </>
          }
          footer={
            <QuickDateRange
              onSelect={({ from, to }) => {
                setFromDate(from);
                setToDate(to);
                setPage(0);
              }}
            />
          }
        >
          <DateField
            label="Desde"
            size="small"
            value={fromDate}
            onChange={(value) => setFromDate(value)}
          />
          <DateField
            label="Hasta"
            size="small"
            value={toDate}
            onChange={(value) => setToDate(value)}
          />
        <FormControl size="small" fullWidth>
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
            <MenuItem value="CREDIT_NOTE">Devoluciones</MenuItem>
            <MenuItem value="EXPENSE">Causaciones</MenuItem>
            <MenuItem value="EXPENSE_PAYMENT">Pagos de causaciones</MenuItem>
            <MenuItem value="CASH_MOVEMENT">Recibos y egresos de caja</MenuItem>
            <MenuItem value="BANK_MOVEMENT">Recibos y egresos bancarios</MenuItem>
            <MenuItem value="REVERSAL">Anulaciones</MenuItem>
            <MenuItem value="MANUAL_NOTE">Notas contables</MenuItem>
          </Select>
        </FormControl>
          <TextField
            label="Buscar descripción o documento"
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ gridColumn: { sm: 'span 2' } }}
          />
        </FilterBar>

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
                        const origin = originOf(entry.sourceType);
                        const status = statusOf(entry);
                        const isReversal = Boolean(entry.reversalOfId);

                        return (
                          <TableRow key={entry.id} hover>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {formatDate(entry.entryDate)}
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={origin.label}
                                color={origin.color}
                                variant={isReversal ? 'filled' : 'outlined'}
                              />
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              <SourceDocument entry={entry} />
                            </TableCell>
                            <TableCell sx={{ maxWidth: 260 }}>
                              <Typography variant="body2" noWrap title={entry.description}>
                                {entry.description}
                              </Typography>
                              {entry.reversalReason && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: 'block' }}
                                >
                                  Motivo: {entry.reversalReason}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              $
                              {Number(entry.totalDebit).toLocaleString('es-CO', {
                                minimumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              $
                              {Number(entry.totalCredit).toLocaleString('es-CO', {
                                minimumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell align="center">
                              <Chip size="small" label={status.label} color={status.color} />
                            </TableCell>
                            <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => setSelectedEntryId(entry.id)}
                              >
                                Detalle
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<PrintIcon />}
                                onClick={() => setPrintEntryId(entry.id)}
                                sx={{ ml: 1 }}
                              >
                                Imprimir
                              </Button>
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
        <DialogTitle sx={{ fontWeight: 700 }}>Detalle del Comprobante Contable</DialogTitle>
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
                    <strong>Fecha:</strong> {formatDate(entryDetail.entryDate)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Origen:</strong> {originOf(entryDetail.sourceType).label}
                    {entryDetail.sourceDocument && (
                      <>
                        {' '}
                        <SourceDocument entry={entryDetail} />
                      </>
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Usuario:</strong> {entryDetail.createdByName || 'Sistema'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Estado:</strong> {statusOf(entryDetail).label}
                  </Typography>
                </Stack>
                {entryDetail.reversalOfId && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Este asiento anula otro asiento
                    {entryDetail.sourceDocument
                      ? ` del documento ${entryDetail.sourceDocument.number}`
                      : ''}
                    .{entryDetail.reversalReason && ` Motivo: ${entryDetail.reversalReason}`}
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
                            <Chip
                              size="small"
                              variant="outlined"
                              label={getAccountingPurposeLabel(l.purpose)}
                            />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{l.description || '-'}</TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: Number(l.debit) > 0 ? 600 : 400 }}
                        >
                          ${Number(l.debit).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: Number(l.credit) > 0 ? 600 : 400 }}
                        >
                          ${Number(l.credit).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell colSpan={5} sx={{ fontWeight: 700, textAlign: 'right' }}>
                        TOTALES:
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        $
                        {Number(entryDetail.totalDebit).toLocaleString('es-CO', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        $
                        {Number(entryDetail.totalCredit).toLocaleString('es-CO', {
                          minimumFractionDigits: 2,
                        })}
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
          {entryDetail && (
            <Button
              variant="outlined"
              startIcon={<PrintIcon />}
              onClick={() => setPrintEntryId(entryDetail.id)}
            >
              Imprimir
            </Button>
          )}
          {entryDetail && canAnnul(entryDetail) && (
            <Button color="warning" variant="outlined" onClick={() => handleOpenAnnul(entryDetail)}>
              Anular
            </Button>
          )}
          <Button onClick={() => setSelectedEntryId(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Imprimible de Comprobante Contable / Libro Diario (REQ-010) */}
      <JournalEntryPrintDialog
        open={Boolean(printEntryId && printEntryDetail)}
        entry={printEntryDetail || null}
        onClose={() => setPrintEntryId(null)}
      />

      {/* Anulación de una nota contable, un saldo inicial o un cierre anual */}
      <Dialog
        open={Boolean(annullingEntry)}
        onClose={() => setAnnullingEntry(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Anular asiento</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="warning">
              Se registrará un asiento que invierte exactamente los débitos y créditos de este
              asiento. El original se conserva. Esta acción no se puede deshacer.
            </Alert>
            {actionError && <Alert severity="error">{actionError}</Alert>}
            <DateField
              label="Fecha de la anulación"
              size="small"
              value={annulDate}
              onChange={(value) => setAnnulDate(value)}
              fullWidth
            />
            <TextField
              label="Motivo de la anulación"
              multiline
              rows={3}
              value={annulReason}
              onChange={(e) => setAnnulReason(e.target.value)}
              fullWidth
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnnullingEntry(null)} disabled={annulMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmAnnul}
            variant="contained"
            color="warning"
            disabled={annulMutation.isPending}
          >
            {annulMutation.isPending ? 'Anulando…' : 'Confirmar anulación'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};
