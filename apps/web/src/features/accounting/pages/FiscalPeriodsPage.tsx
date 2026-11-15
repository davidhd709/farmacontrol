import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  Grid,
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
  Typography,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import {
  fetchFiscalPeriods,
  generateFiscalPeriods,
  closeFiscalPeriod,
  reopenFiscalPeriod,
  type FiscalPeriodDto,
  type FiscalPeriodStatus,
} from '../api/accounting.api';
import { DocumentLockCard } from '../components/DocumentLockCard';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { AnnualClosingCard } from '../components/AnnualClosingCard';
import { businessYear } from '../../../utils/business-date';
import { formatDate } from '../../../utils/date-format';

function formatMoney(value: string | number): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const FiscalPeriodsPage = () => {
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();

  const currentYear = businessYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal de Cierre
  const [closingPeriod, setClosingPeriod] = useState<FiscalPeriodDto | null>(null);
  const [generateClosingEntry, setGenerateClosingEntry] = useState(true);

  // Modal de Reapertura
  const [reopeningPeriod, setReopeningPeriod] = useState<FiscalPeriodDto | null>(null);

  // Mensajes de error/éxito
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const {
    data: periods = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['fiscal-periods', selectedYear, statusFilter],
    queryFn: () =>
      fetchFiscalPeriods(
        selectedYear,
        statusFilter === 'ALL' ? undefined : (statusFilter as FiscalPeriodStatus),
      ),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateFiscalPeriods({ year: selectedYear }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] });
      setFeedback({
        type: 'success',
        message: `Períodos del año ${selectedYear} generados correctamente.`,
      });
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err.message || 'Error al generar períodos fiscales.' });
    },
  });

  const closeMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { generateClosingEntry?: boolean; notes?: string };
    }) => closeFiscalPeriod(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] });
      setClosingPeriod(null);
      setFeedback({
        type: 'success',
        message: `El período ${data.name} ha sido cerrado exitosamente. Los asientos históricos dentro de sus fechas han quedado bloqueados.`,
      });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      reopenFiscalPeriod(id, { reason }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] });
      setReopeningPeriod(null);
      setFeedback({
        type: 'success',
        message: `El período ${data.name} ha sido reabierto exitosamente. Se ha registrado la auditoría correspondiente.`,
      });
    },
  });

  if (!hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_READ)) {
    return (
      <Container component="main" sx={{ py: { xs: 1, md: 2 } }}>
        <Alert severity="warning">No tienes permiso para consultar períodos fiscales.</Alert>
      </Container>
    );
  }

  const canManage = hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_MANAGE);

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
              Períodos Contables y Cierre Fiscal
            </Typography>
            <Typography color="text.secondary">
              Control mensual de períodos contables, bloqueo histórico contra modificaciones y
              generación de asientos de cierre del ejercicio.
            </Typography>
          </Box>
          {canManage && (
            <Button
              variant="contained"
              color="primary"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? 'Generando...' : `Generar Períodos ${selectedYear}`}
            </Button>
          )}
        </Box>

        {feedback && (
          <Alert severity={feedback.type} onClose={() => setFeedback(null)}>
            {feedback.message}
          </Alert>
        )}

        <DocumentLockCard canManage={canManage} />
        <AnnualClosingCard canManage={canManage} />

        {/* Filtros de Año y Estado */}
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
            <FormControl sx={{ minWidth: 140 }} size="small">
              <InputLabel id="year-select-label">Año Fiscal</InputLabel>
              <Select
                labelId="year-select-label"
                value={selectedYear}
                label="Año Fiscal"
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 160 }} size="small">
              <InputLabel id="status-select-label">Estado</InputLabel>
              <Select
                labelId="status-select-label"
                value={statusFilter}
                label="Estado"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="ALL">Todos los Estados</MenuItem>
                <MenuItem value="OPEN">Abiertos</MenuItem>
                <MenuItem value="CLOSED">Cerrados</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ flexGrow: 1 }} />

            <Button variant="outlined" onClick={() => refetch()}>
              Actualizar
            </Button>
          </Stack>
        </Paper>

        {/* Resumen rápido de períodos */}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ bgcolor: 'background.paper' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Total Períodos en {selectedYear}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {periods.length} / 12
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ bgcolor: 'background.paper' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Períodos Abiertos
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
                  {periods.filter((p) => p.status === 'OPEN').length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Card sx={{ bgcolor: 'background.paper' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Períodos Cerrados (Bloqueados)
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  {periods.filter((p) => p.status === 'CLOSED').length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Tabla de Períodos Fiscales */}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : isError ? (
          <Alert severity="error">Error al cargar la lista de períodos fiscales.</Alert>
        ) : periods.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              No hay períodos contables registrados para el año {selectedYear}.
            </Typography>
            {canManage && (
              <Button
                variant="contained"
                sx={{ mt: 2 }}
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                Generar 12 Períodos del Año {selectedYear}
              </Button>
            )}
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Período</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Rango de Fechas</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Asientos
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Total Débitos
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Total Créditos
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Detalle de Cierre / Reapertura</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">
                    Acciones
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {periods.map((period) => {
                  const isClosed = period.status === 'CLOSED';
                  return (
                    <TableRow key={period.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{period.name}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {formatDate(period.startDate)} al {formatDate(period.endDate)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={isClosed ? 'CERRADO' : 'ABIERTO'}
                          color={isClosed ? 'default' : 'success'}
                          size="small"
                          sx={{ fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell align="right">{period.entriesCount}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                        {formatMoney(period.totalDebits)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                        {formatMoney(period.totalCredits)}
                      </TableCell>
                      <TableCell>
                        {isClosed ? (
                          <Box>
                            <Typography variant="caption" component="div" color="text.secondary">
                              Cerrado el {formatDate(period.closedAt)} por{' '}
                              <b>{period.closedByName || 'Sistema'}</b>
                            </Typography>
                            {period.closingEntryId && (
                              <Typography variant="caption" component="div" color="primary.main">
                                Asiento de cierre generado
                              </Typography>
                            )}
                            {period.notes && (
                              <Typography
                                variant="caption"
                                component="div"
                                sx={{ fontStyle: 'italic' }}
                              >
                                &quot;{period.notes}&quot;
                              </Typography>
                            )}
                          </Box>
                        ) : period.reopenedAt ? (
                          <Box>
                            <Typography variant="caption" component="div" color="warning.main">
                              Reabierto el {formatDate(period.reopenedAt)} por{' '}
                              <b>{period.reopenedByName || 'Admin'}</b>
                            </Typography>
                            <Typography
                              variant="caption"
                              component="div"
                              sx={{ fontStyle: 'italic' }}
                            >
                              Motivo: &quot;{period.reopenReason}&quot;
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Período operativo regular
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {canManage &&
                          (isClosed ? (
                            <Button
                              variant="outlined"
                              color="warning"
                              size="small"
                              onClick={() => {
                                setReopeningPeriod(period);
                              }}
                            >
                              Reabrir
                            </Button>
                          ) : (
                            <Button
                              variant="contained"
                              color="error"
                              size="small"
                              onClick={() => {
                                setClosingPeriod(period);
                                setGenerateClosingEntry(true);
                              }}
                            >
                              Cerrar
                            </Button>
                          ))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>

      {/* Cierre y reapertura con la confirmación común: un error queda dentro del diálogo */}
      <ConfirmDialog
        open={Boolean(closingPeriod)}
        operationType="close"
        title={`¿Cerrar el período ${closingPeriod?.name ?? ''}?`}
        subject={
          closingPeriod
            ? `${closingPeriod.name} · ${formatDate(closingPeriod.startDate)} al ${formatDate(closingPeriod.endDate)}`
            : null
        }
        effects={[
          `No se podrán crear, editar ni reversar asientos con fecha del ${formatDate(closingPeriod?.startDate)} al ${formatDate(closingPeriod?.endDate)}.`,
          generateClosingEntry
            ? 'Se genera el asiento de cierre que cancela los saldos de ingresos, gastos y costos contra el resultado del ejercicio.'
            : 'No se genera asiento de cierre del ejercicio.',
          'El período puede reabrirse después con un motivo, que queda en la auditoría.',
        ]}
        description={
          <FormControlLabel
            control={
              <Checkbox
                checked={generateClosingEntry}
                onChange={(e) => setGenerateClosingEntry(e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  Generar asiento contable de cierre del ejercicio
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Cancela los saldos de cuentas de Ingresos (4), Gastos (5) y Costos (6) trasladando
                  el resultado neto a la cuenta 3605 - Resultado del Ejercicio.
                </Typography>
              </Box>
            }
          />
        }
        reason={{
          label: 'Notas u observaciones de cierre (opcional)',
          required: false,
          maxLength: 500,
        }}
        confirmText="Cerrar período"
        onConfirm={(notes) =>
          closingPeriod
            ? closeMutation.mutateAsync({
                id: closingPeriod.id,
                payload: { generateClosingEntry, notes: notes ?? '' },
              })
            : undefined
        }
        onCancel={() => setClosingPeriod(null)}
      />

      <ConfirmDialog
        open={Boolean(reopeningPeriod)}
        operationType="revert"
        title={`¿Reabrir el período ${reopeningPeriod?.name ?? ''}?`}
        subject={
          reopeningPeriod
            ? `${reopeningPeriod.name} · ${formatDate(reopeningPeriod.startDate)} al ${formatDate(reopeningPeriod.endDate)}`
            : null
        }
        effects={[
          'Se vuelven a permitir asientos y reversiones en las fechas del período.',
          'Si el período tiene asiento de cierre, se revierte automáticamente.',
          'La reapertura y su motivo quedan en la auditoría.',
        ]}
        reason={{
          label: 'Motivo de la reapertura',
          minLength: 10,
          maxLength: 500,
          helperText: 'Mínimo 10 caracteres: la justificación o solicitud que la autoriza.',
        }}
        confirmText="Reabrir período"
        onConfirm={(reason) =>
          reopeningPeriod
            ? reopenMutation.mutateAsync({ id: reopeningPeriod.id, reason: reason ?? '' })
            : undefined
        }
        onCancel={() => setReopeningPeriod(null)}
      />
    </Container>
  );
};
