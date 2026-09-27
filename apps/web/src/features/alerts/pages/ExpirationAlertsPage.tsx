import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HomeBackButton } from '../../../components/HomeBackButton';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
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
            label={`🔴 VENCIDO (${Math.abs(days)}d)`}
            sx={{ fontWeight: 700 }}
            data-testid="chip-severity-vencido"
          />
        );
      case 'CRITICO':
        return (
          <Chip
            size="small"
            color="warning"
            label={`🟠 CRÍTICO (${days}d)`}
            sx={{ fontWeight: 700, bgcolor: '#ed6c02', color: '#fff' }}
            data-testid="chip-severity-critico"
          />
        );
      case 'ALERTA':
        return (
          <Chip
            size="small"
            color="warning"
            label={`🟡 ALERTA (${days}d)`}
            sx={{ fontWeight: 600 }}
            data-testid="chip-severity-alerta"
          />
        );
      case 'PROXIMO':
        return (
          <Chip
            size="small"
            color="info"
            label={`🔵 PRÓXIMO (${days}d)`}
            sx={{ fontWeight: 600 }}
            data-testid="chip-severity-proximo"
          />
        );
      default:
        return <Chip size="small" label={sev} />;
    }
  };

  const formatDaysText = (days: number) => {
    if (days < 0) return `Venció hace ${Math.abs(days)} días`;
    if (days === 0) return 'Vence hoy';
    if (days === 1) return 'Vence mañana (1 día)';
    return `Quedan ${days} días`;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
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
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
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
          <Card variant="outlined">
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                TOTAL EN RIESGO
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5 }}>
                {summaryQuery.data?.totalActive ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Lotes activos con stock
              </Typography>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderColor: 'error.main' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="error.main" sx={{ fontWeight: 700 }}>
                🔴 VENCIDOS (≤ 0d)
              </Typography>
              <Typography variant="h4" color="error.main" sx={{ fontWeight: 800, mt: 0.5 }}>
                {summaryQuery.data?.vencidos ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Retiro urgente de anaquel
              </Typography>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderColor: '#ed6c02' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" sx={{ color: '#ed6c02', fontWeight: 700 }}>
                🟠 CRÍTICOS (&lt; 30d)
              </Typography>
              <Typography variant="h4" sx={{ color: '#ed6c02', fontWeight: 800, mt: 0.5 }}>
                {summaryQuery.data?.criticos ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Rotación inmediata FEFO
              </Typography>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderColor: 'warning.main' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 700 }}>
                🟡 EN ALERTA (31-60d)
              </Typography>
              <Typography variant="h4" color="warning.dark" sx={{ fontWeight: 800, mt: 0.5 }}>
                {summaryQuery.data?.alertas ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Priorizar en dispensación
              </Typography>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderColor: 'info.main' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="info.main" sx={{ fontWeight: 700 }}>
                🔵 PRÓXIMOS (61-90d)
              </Typography>
              <Typography variant="h4" color="info.main" sx={{ fontWeight: 800, mt: 0.5 }}>
                {summaryQuery.data?.proximos ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Monitoreo preventivo
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Barra de Filtros y Búsqueda */}
        <Paper variant="outlined" sx={{ p: 2 }}>
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
    </Container>
  );
}

export default ExpirationAlertsPage;
