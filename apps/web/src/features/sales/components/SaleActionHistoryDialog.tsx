import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Paper,
  Stack,
  Divider,
} from '@mui/material';
import type { SaleActionHistoryDto, SaleActionEventDto, SaleActionType } from '@farmacia/contracts';
import { fetchSaleActionHistory } from '../api/sales.api';
import { formatDateTime } from '../../../utils/date-format';

interface SaleActionHistoryDialogProps {
  open: boolean;
  saleId: string | null;
  invoiceNumber?: string | null;
  onClose: () => void;
}

const EVENT_TYPE_CONFIG: Record<
  SaleActionType,
  { label: string; color: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info' | 'default' }
> = {
  VENTA_CREADA: { label: 'Venta creada', color: 'primary' },
  CARTERA_REGISTRADA: { label: 'Registro en cartera', color: 'info' },
  ABONO_REGISTRADO: { label: 'Abono recibido', color: 'success' },
  ABONO_REVERTIDO: { label: 'Abono revertido', color: 'error' },
  NOTA_CREDITO_CREADA: { label: 'Nota crédito aplicada', color: 'warning' },
  NOTA_CREDITO_ANULADA: { label: 'Nota crédito anulada', color: 'error' },
  VENTA_ANULADA: { label: 'Factura anulada', color: 'error' },
};

function formatCurrency(amount?: number | null): string {
  if (amount === undefined || amount === null) return '';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const SaleActionHistoryDialog: React.FC<SaleActionHistoryDialogProps> = ({
  open,
  saleId,
  invoiceNumber,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<SaleActionHistoryDto | null>(null);

  useEffect(() => {
    if (!open || !saleId) {
      setHistory(null);
      setErrorMsg(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setErrorMsg(null);

    fetchSaleActionHistory(saleId)
      .then((data) => {
        if (isMounted) setHistory(data);
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Error al cargar el historial de la factura',
          );
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, saleId]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      data-testid="sale-action-history-dialog"
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
        >
          <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
            Historial de Acciones — Factura {history?.invoiceNumber || invoiceNumber || ''}
          </Typography>
          {history && (
            <Chip
              label={history.status === 'COMPLETED' ? 'Completada' : 'Anulada'}
              color={history.status === 'COMPLETED' ? 'success' : 'error'}
              size="small"
              sx={{ fontWeight: 'bold' }}
            />
          )}
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        {!loading && history && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Resumen de la Factura */}
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={3}
                sx={{ justifyContent: 'space-between' }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Cliente
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                    {history.customerName || 'Consumidor Final'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Facturado
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    {formatCurrency(history.total)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Eventos Registrados
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                    {history.events.length} acción(es)
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            <Alert severity="info" sx={{ py: 0.5 }}>
              Este historial es exclusivamente de consulta y presenta la trazabilidad cronológica
              inmutable de la venta, abonos, notas crédito y anulaciones.
            </Alert>

            {/* Línea de tiempo cronológica de eventos */}
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
              Línea de Tiempo Cronológica
            </Typography>

            {history.events.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No se registran eventos adicionales para esta factura.
              </Typography>
            ) : (
              <Stack spacing={2} sx={{ position: 'relative', pl: 1 }}>
                {history.events.map((event: SaleActionEventDto, idx: number) => {
                  const cfg = EVENT_TYPE_CONFIG[event.type] || {
                    label: event.type,
                    color: 'default' as const,
                  };
                  return (
                    <Paper
                      key={event.id || idx}
                      variant="outlined"
                      sx={{
                        p: 2,
                        borderLeftWidth: 4,
                        borderLeftColor: `${cfg.color}.main`,
                        transition: 'background-color 0.2s',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                      data-testid={`history-event-${event.type}`}
                    >
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        sx={{
                          justifyContent: 'space-between',
                          alignItems: { xs: 'flex-start', sm: 'center' },
                          mb: 1,
                          gap: 1,
                        }}
                      >
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Chip
                            label={cfg.label}
                            color={cfg.color}
                            size="small"
                            variant="filled"
                            sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}
                          />
                          {event.documentNumber && (
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                              {event.documentNumber}
                            </Typography>
                          )}
                        </Stack>

                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(event.timestamp)}
                        </Typography>
                      </Stack>

                      <Typography variant="body2" sx={{ mb: 1 }}>
                        {event.description}
                      </Typography>

                      <Divider sx={{ my: 1 }} />

                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={2}
                        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          Responsable: <strong>{event.userName || 'Sistema'}</strong>
                        </Typography>

                        {event.amount !== undefined && event.amount !== null && (
                          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                            Monto:{' '}
                            <Box component="span" sx={{ color: 'text.primary' }}>
                              {formatCurrency(event.amount)}
                            </Box>
                          </Typography>
                        )}

                        {event.reason && (
                          <Typography variant="caption" color="text.secondary">
                            Motivo: <em>{event.reason}</em>
                          </Typography>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} variant="outlined">
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

