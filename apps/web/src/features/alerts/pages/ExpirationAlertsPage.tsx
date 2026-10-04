import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HomeBackButton } from '../../../components/HomeBackButton';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
  TableRow,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Pagination,
} from '@mui/material';
import type { ExpirationSeverity, InventoryAlertDto } from '@farmacia/contracts';
import {
  fetchExpirations,
  fetchAlertsSummary,
  triggerAlertsEvaluation,
} from '../api/alerts.api';

export function ExpirationAlertsPage() {
  const queryClient = useQueryClient();

  const [severity, setSeverity] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Consulta de resumen estadístico para las tarjetas superiores
  const summaryQuery = useQuery({
    queryKey: ['alerts', 'summary'],
    queryFn: fetchAlertsSummary,
    refetchInterval: 30000,
  });

  // Consulta paginada y filtrada de lotes en riesgo
  const alertsQuery = useQuery({
    queryKey: ['alerts', 'expirations', severity, search, page],
    queryFn: () =>
      fetchExpirations({
        severity: severity === 'ALL' ? undefined : (severity as ExpirationSeverity),
        search: search.trim() ? search.trim() : undefined,
        page,
        pageSize: 10,
        isResolved: false,
      }),
  });

  // Mutación para disparar evaluación manual
  const evaluateMutation = useMutation({
    mutationFn: () => triggerAlertsEvaluation(),
    onSuccess: (data) => {
      setActionMessage({
        type: 'success',
        text: `Escaneo completado: ${data.evaluatedLots} lotes analizados (${data.createdAlerts} nuevas alertas, ${data.updatedAlerts} actualizadas, ${data.resolvedAlerts} resueltas).`,
      });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: () => {
      setActionMessage({
        type: 'error',
        text: 'Ocurrió un error al ejecutar el escaneo de vencimientos. Por favor intente nuevamente.',
      });
    },
  });

  const getSeverityChip = (sev: ExpirationSeverity, days: number) => {
    switch (sev) {
      case 'VENCIDO':
        return (
          <Chip
            size="small"
            color="error"
            variant="outlined"
            label={`🔴 VENCIDO (${Math.abs(days)}d)`}
            sx={{
              fontWeight: 700,
              bgcolor: 'rgba(211, 47, 47, 0.04)',
              borderColor: 'rgba(211, 47, 47, 0.4)',
            }}
            data-testid="chip-severity-vencido"
          />
        );
      case 'CRITICO':
        return (
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={`🟠 CRÍTICO (${days}d)`}
            sx={{
              fontWeight: 700,
              bgcolor: 'rgba(237, 108, 2, 0.06)',
              color: '#c25e00',
              borderColor: 'rgba(237, 108, 2, 0.5)',
            }}
            data-testid="chip-severity-critico"
          />
        );
      case 'ALERTA':
        return (
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={`🟡 ALERTA (${days}d)`}
            sx={{
              fontWeight: 600,
              bgcolor: 'rgba(237, 108, 2, 0.04)',
              borderColor: 'rgba(237, 108, 2, 0.35)',
            }}
            data-testid="chip-severity-alerta"
          />
        );
      case 'PROXIMO':
        return (
          <Chip
            size="small"
            color="info"
            variant="outlined"
            label={`🔵 PRÓXIMO (${days}d)`}
            sx={{
              fontWeight: 600,
              bgcolor: 'rgba(2, 136, 209, 0.04)',
              borderColor: 'rgba(2, 136, 209, 0.35)',
            }}
            data-testid="chip-severity-proximo"
          />
        );
      default:
        return <Chip size="small" variant="outlined" label={sev} />;
    }
  };

  const formatDaysText = (days: number) => {
    if (days < 0) return `Venció hace ${Math.abs(days)} días`;
    if (days === 0) return 'Vence hoy';
    if (days === 1) return 'Vence mañana (1 día)';
    return `Quedan ${days} días`;
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, margin: '0 auto' }}>
      <Stack spacing={3}>
        {/* Cabecera con navegación y botón de acción */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 800, color: 'text.primary' }}>
              Alertas de Vencimiento de Lotes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Monitoreo preventivo y semaforización de medicamentos y existencias por vencer.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <HomeBackButton />
            <Button
              variant="contained"
              color="primary"
              onClick={() => evaluateMutation.mutate()}
              disabled={evaluateMutation.isPending}
              data-testid="trigger-scan-btn"
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                transition: 'transform 0.1s ease, background-color 0.15s ease',
                '&:active': { transform: 'scale(0.98)' },
              }}
            >
              {evaluateMutation.isPending ? 'Escaneando…' : '↻ Escanear Lotes Ahora'}
            </Button>
          </Box>
        </Box>

        {actionMessage ? (
          <Alert
            severity={actionMessage.type}
            onClose={() => setActionMessage(null)}
            data-testid="action-feedback-alert"
            sx={{ borderRadius: 2 }}
          >
            {actionMessage.text}
          </Alert>
        ) : null}

        {/* Tarjetas de Resumen de Vencimientos */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' },
            gap: 2,
          }}
        >
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
                TOTAL EN RIESGO
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                {summaryQuery.data?.totalActive ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Lotes activos con stock
              </Typography>
            </CardContent>
          </Card>

          <Card
            variant="outlined"
            sx={{
              borderRadius: 2,
              bgcolor: 'rgba(211, 47, 47, 0.02)',
              borderColor: 'rgba(211, 47, 47, 0.25)',
            }}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="error.main" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                🔴 VENCIDOS (≤ 0d)
              </Typography>
              <Typography variant="h4" color="error.main" sx={{ fontWeight: 800, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                {summaryQuery.data?.vencidos ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Retiro urgente de anaquel
              </Typography>
            </CardContent>
          </Card>

          <Card
            variant="outlined"
            sx={{
              borderRadius: 2,
              bgcolor: 'rgba(237, 108, 2, 0.02)',
              borderColor: 'rgba(237, 108, 2, 0.25)',
            }}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" sx={{ color: '#c25e00', fontWeight: 700, letterSpacing: 0.5 }}>
                🟠 CRÍTICOS (&lt; 30d)
              </Typography>
              <Typography variant="h4" sx={{ color: '#c25e00', fontWeight: 800, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                {summaryQuery.data?.criticos ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Rotación inmediata FEFO
              </Typography>
            </CardContent>
          </Card>

          <Card
            variant="outlined"
            sx={{
              borderRadius: 2,
              bgcolor: 'rgba(237, 108, 2, 0.015)',
              borderColor: 'rgba(237, 108, 2, 0.2)',
            }}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                🟡 EN ALERTA (31-60d)
              </Typography>
              <Typography variant="h4" color="warning.dark" sx={{ fontWeight: 800, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                {summaryQuery.data?.alertas ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Priorizar en dispensación
              </Typography>
            </CardContent>
          </Card>

          <Card
            variant="outlined"
            sx={{
              borderRadius: 2,
              bgcolor: 'rgba(2, 136, 209, 0.015)',
              borderColor: 'rgba(2, 136, 209, 0.2)',
            }}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="info.main" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
                🔵 PRÓXIMOS (61-90d)
              </Typography>
              <Typography variant="h4" color="info.main" sx={{ fontWeight: 800, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                {summaryQuery.data?.proximos ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Monitoreo preventivo
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Barra de Filtros y Búsqueda */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Buscar por producto, código o lote…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              sx={{ flexGrow: 1 }}
              slotProps={{ htmlInput: { 'data-testid': 'search-alerts-input' } }}
            />

            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="severity-select-label">Severidad</InputLabel>
              <Select
                labelId="severity-select-label"
                value={severity}
                label="Severidad"
                onChange={(e) => {
                  setSeverity(e.target.value);
                  setPage(1);
                }}
                data-testid="severity-select"
              >
                <MenuItem value="ALL">Todas las severidades</MenuItem>
                <MenuItem value="VENCIDO">🔴 Vencidos (≤ 0 días)</MenuItem>
                <MenuItem value="CRITICO">🟠 Críticos (1 - 30 días)</MenuItem>
                <MenuItem value="ALERTA">🟡 Alerta (31 - 60 días)</MenuItem>
                <MenuItem value="PROXIMO">🔵 Próximos (61 - 90 días)</MenuItem>
              </Select>
            </FormControl>

            {(search || severity !== 'ALL') && (
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  setSearch('');
                  setSeverity('ALL');
                  setPage(1);
                }}
                data-testid="clear-filters-btn"
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  transition: 'transform 0.1s ease',
                  '&:active': { transform: 'scale(0.98)' },
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </Stack>
        </Paper>

        {/* Tabla de Alertas de Vencimiento */}
        <Paper variant="outlined">
          <TableContainer>
            <Table size="medium" aria-label="Tabla de alertas de vencimiento">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Categoría</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Lote</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Vencimiento</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Estado / Severidad</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Stock Disponible
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Ubicación</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alertsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={32} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Cargando alertas de inventario…
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : alertsQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Alert severity="error">
                        Error al cargar las alertas. Por favor verifica tu sesión o intenta nuevamente.
                      </Alert>
                    </TableCell>
                  </TableRow>
                ) : alertsQuery.data?.items?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <Typography variant="h6" color="text.secondary" gutterBottom>
                        No se encontraron lotes en riesgo de vencimiento
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {search || severity !== 'ALL'
                          ? 'Prueba ampliando los filtros de búsqueda o severidad.'
                          : '¡Excelente! Todos los lotes activos cuentan con vigencia superior a 90 días.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  alertsQuery.data?.items?.map((item: InventoryAlertDto) => (
                    <TableRow key={item.id} hover data-testid={`alert-row-${item.lotNumber}`}>
                      <TableCell>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {item.productName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Cód: {item.productCode}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.categoryName || 'General'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.lotNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.expirationDate}</Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color:
                              item.daysRemaining <= 0
                                ? 'error.main'
                                : item.daysRemaining <= 30
                                ? '#ed6c02'
                                : 'text.secondary',
                            fontWeight: item.daysRemaining <= 30 ? 700 : 400,
                          }}
                        >
                          {formatDaysText(item.daysRemaining)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {getSeverityChip(item.severity, item.daysRemaining)}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {item.currentQuantity}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.baseUnit || 'UNIDAD'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.locationName || 'General'}</Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Paginación */}
          {alertsQuery.data && alertsQuery.data.totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <Pagination
                count={alertsQuery.data.totalPages}
                page={page}
                onChange={(_, newPage) => setPage(newPage)}
                color="primary"
                data-testid="alerts-pagination"
              />
            </Box>
          )}
        </Paper>
      </Stack>
    </Box>
  );
}

export default ExpirationAlertsPage;
