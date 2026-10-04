import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TablePagination,
  TextField,
  MenuItem,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Divider,
  InputAdornment,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonIcon from '@mui/icons-material/Person';
import ComputerIcon from '@mui/icons-material/Computer';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HistoryIcon from '@mui/icons-material/History';
import SearchIcon from '@mui/icons-material/Search';

import { HomeBackButton } from '../../../components/HomeBackButton';
import type { AuditEventDto, AuditMetadataDto } from '@farmacia/contracts';
import { fetchAuditEvents, fetchAuditMetadata } from '../api/audit.api';

export const AuditLogsPage = () => {
  const [events, setEvents] = useState<AuditEventDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Metadata para filtros dinámicos
  const [metadata, setMetadata] = useState<AuditMetadataDto>({ entities: [], actions: [] });

  // Filtros
  const [selectedEntity, setSelectedEntity] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [correlationIdInput, setCorrelationIdInput] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Dialog detalle
  const [selectedEvent, setSelectedEvent] = useState<AuditEventDto | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const loadMetadata = useCallback(async () => {
    try {
      const res = await fetchAuditMetadata();
      setMetadata(res);
    } catch (err: any) {
      console.error('Error al cargar metadatos de auditoría:', err);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetchAuditEvents({
        page: page + 1,
        pageSize,
        entity: selectedEntity || undefined,
        action: selectedAction || undefined,
        correlationId: correlationIdInput.trim() || undefined,
        search: searchQuery.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setEvents(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al consultar logs de auditoría.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectedEntity, selectedAction, correlationIdInput, searchQuery, fromDate, toDate]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleClearFilters = () => {
    setSelectedEntity('');
    setSelectedAction('');
    setSearchQuery('');
    setCorrelationIdInput('');
    setFromDate('');
    setToDate('');
    setPage(0);
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(`${label} copiado al portapapeles`);
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  const handleFilterByCorrelation = (corrId: string) => {
    setCorrelationIdInput(corrId);
    setPage(0);
  };

  const getActionColor = (action: string): 'success' | 'info' | 'warning' | 'error' | 'default' => {
    const act = action.toLowerCase();
    if (act.includes('create') || act.includes('confirm') || act.includes('receive') || act.includes('open')) {
      return 'success';
    }
    if (act.includes('cancel') || act.includes('reverse') || act.includes('delete') || act.includes('deactivate')) {
      return 'error';
    }
    if (act.includes('adjust') || act.includes('close') || act.includes('reopen') || act.includes('password')) {
      return 'warning';
    }
    if (act.includes('update') || act.includes('edit') || act.includes('login') || act.includes('post')) {
      return 'info';
    }
    return 'default';
  };

  const formatDateTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return isoString;
    }
  };

  const activeFiltersCount = [
    selectedEntity,
    selectedAction,
    searchQuery,
    correlationIdInput,
    fromDate,
    toDate,
  ].filter(Boolean).length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <HomeBackButton />

      {/* Encabezado */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon fontSize="large" color="primary" />
            Auditoría y Trazabilidad
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Registro inmutable de eventos sensibles, mutaciones operativas y correlación de peticiones HTTP
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => loadEvents()}
          disabled={loading}
        >
          Actualizar
        </Button>
      </Box>

      {copyFeedback && (
        <Alert severity="success" icon={<CheckCircleIcon fontSize="inherit" />} sx={{ mb: 2 }}>
          {copyFeedback}
        </Alert>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {/* Tarjetas KPI Resumen */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                TOTAL DE EVENTOS REGISTRADOS
              </Typography>
              <Typography variant="h5" color="primary.main" sx={{ mt: 0.5, fontWeight: 700 }}>
                {total.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                ENTIDADES AUDITADAS
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
                {metadata.entities.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                TIPOS DE ACCIÓN CATALOGADAS
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
                {metadata.actions.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                FILTROS ACTIVOS
              </Typography>
              <Typography variant="h5" color={activeFiltersCount > 0 ? 'warning.main' : 'text.secondary'} sx={{ mt: 0.5, fontWeight: 700 }}>
                {activeFiltersCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Barra de Filtros */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="Buscar por texto"
              placeholder="Acción, ID, entidad..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Entidad"
              value={selectedEntity}
              onChange={(e) => {
                setSelectedEntity(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">Todas las entidades</MenuItem>
              {metadata.entities.map((ent) => (
                <MenuItem key={ent} value={ent}>
                  {ent}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Acción"
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">Todas las acciones</MenuItem>
              {metadata.actions.map((act) => (
                <MenuItem key={act} value={act}>
                  {act}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Fecha Desde"
              slotProps={{ inputLabel: { shrink: true } }}
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Fecha Hasta"
              slotProps={{ inputLabel: { shrink: true } }}
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 1 }}>
            <Button
              fullWidth
              variant="outlined"
              color="inherit"
              startIcon={<FilterAltOffIcon />}
              onClick={handleClearFilters}
              disabled={activeFiltersCount === 0}
              sx={{ height: 40 }}
            >
              Limpiar
            </Button>
          </Grid>
        </Grid>

        {correlationIdInput && (
          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Filtrando por Correlation ID:
            </Typography>
            <Chip
              size="small"
              label={correlationIdInput}
              onDelete={() => {
                setCorrelationIdInput('');
                setPage(0);
              }}
              color="primary"
              variant="outlined"
            />
          </Box>
        )}
      </Paper>

      {/* Tabla de Eventos */}
      <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 650 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Fecha / Hora (Local)</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Usuario</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Acción</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Entidad</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ID de Registro</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>IP</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Correlation ID</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Detalle</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={36} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Cargando eventos de auditoría...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Typography variant="body1" color="text.secondary">
                      No se encontraron registros de auditoría con los filtros aplicados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                events.map((ev) => (
                  <TableRow key={ev.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                      {formatDateTime(ev.createdAt)}
                    </TableCell>
                    <TableCell>
                      {ev.user ? (
                        <Chip
                          icon={<PersonIcon fontSize="small" />}
                          label={ev.user.username}
                          size="small"
                          variant="outlined"
                          sx={{ fontWeight: 500 }}
                        />
                      ) : (
                        <Chip
                          icon={<ComputerIcon fontSize="small" />}
                          label="Sistema"
                          size="small"
                          color="default"
                          variant="filled"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={ev.action}
                        size="small"
                        color={getActionColor(ev.action)}
                        variant="outlined"
                        sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                      {ev.entity}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {ev.entityId ? (
                        <Tooltip title={ev.entityId}>
                          <span>
                            {ev.entityId.length > 18 ? `${ev.entityId.slice(0, 18)}...` : ev.entityId}
                          </span>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                      {ev.ipAddress || '—'}
                    </TableCell>
                    <TableCell>
                      {ev.correlationId ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Tooltip title="Filtrar por esta transacción">
                            <Chip
                              size="small"
                              label={ev.correlationId.length > 12 ? `${ev.correlationId.slice(0, 12)}...` : ev.correlationId}
                              onClick={() => handleFilterByCorrelation(ev.correlationId!)}
                              sx={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}
                            />
                          </Tooltip>
                          <Tooltip title="Copiar Correlation ID">
                            <IconButton
                              size="small"
                              onClick={() => handleCopyText(ev.correlationId!, 'Correlation ID')}
                            >
                              <ContentCopyIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Ver detalle de auditoría">
                        <IconButton
                          color="primary"
                          size="small"
                          onClick={() => setSelectedEvent(ev)}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={total}
          rowsPerPage={pageSize}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setPageSize(parseInt(e.target.value, 10));
            setPage(0);
          }}
          labelRowsPerPage="Filas por página:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count !== -1 ? count : `más de ${to}`}`}
        />
      </Paper>

      {/* Modal de Detalle del Evento */}
      <Dialog
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Detalle del Evento de Auditoría
            </Typography>
          </Box>
          {selectedEvent && (
            <Chip
              label={selectedEvent.action}
              color={getActionColor(selectedEvent.action)}
              size="small"
              sx={{ fontWeight: 600 }}
            />
          )}
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {selectedEvent && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {/* Metadatos en Grid */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">ID DE EVENTO</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {selectedEvent.id}
                    </Typography>
                    <IconButton size="small" onClick={() => handleCopyText(selectedEvent.id, 'ID de Evento')}>
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">FECHA Y HORA (UTC)</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {selectedEvent.createdAt}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">USUARIO ACTOR</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {selectedEvent.user?.username || 'Sistema (Automático)'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">ENTIDAD AFECTADA</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                    {selectedEvent.entity}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary">ID DE REGISTRO AFECTADO</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {selectedEvent.entityId || 'N/A'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">DIRECCIÓN IP</Typography>
                  <Typography variant="body2">{selectedEvent.ipAddress || 'N/A'}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" color="text.secondary">CORRELATION ID (TRAZABILIDAD HTTP)</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {selectedEvent.correlationId || 'N/A'}
                    </Typography>
                    {selectedEvent.correlationId && (
                      <IconButton size="small" onClick={() => handleCopyText(selectedEvent.correlationId!, 'Correlation ID')}>
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                    )}
                  </Box>
                </Grid>
              </Grid>

              <Divider />

              {/* JSON Payload Details */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Carga Útil de Auditoría (Detalles JSONB):
                  </Typography>
                  {selectedEvent.details && (
                    <Button
                      size="small"
                      startIcon={<ContentCopyIcon />}
                      onClick={() => handleCopyText(JSON.stringify(selectedEvent.details, null, 2), 'Detalles JSON')}
                    >
                      Copiar JSON
                    </Button>
                  )}
                </Box>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100'),
                    maxHeight: 350,
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                >
                  {selectedEvent.details ? (
                    <pre style={{ margin: 0 }}>
                      {JSON.stringify(selectedEvent.details, null, 2)}
                    </pre>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Sin detalles adicionales registrados.
                    </Typography>
                  )}
                </Paper>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSelectedEvent(null)} variant="contained">
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default AuditLogsPage;
