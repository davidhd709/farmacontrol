import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { SaleDto, SaleStatus } from '@farmacia/contracts';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { fetchSales, cancelSale } from '../api/sales.api';
import { SaleReceiptDialog } from '../components/SaleReceiptDialog';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { PermissionGate } from '../../auth/components/PermissionGate';

export const SalesHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState<SaleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtros
  const [invoiceNumberFilter, setInvoiceNumberFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SaleStatus>('ALL');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  // Reimpresión / Ver Comprobante
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<SaleDto | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);

  // Diálogo Anular Venta
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState<SaleDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Notificaciones Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetchSales({
        invoiceNumber: invoiceNumberFilter.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        fromDate: fromDateFilter ? new Date(fromDateFilter).toISOString() : undefined,
        toDate: toDateFilter ? new Date(toDateFilter + 'T23:59:59.999Z').toISOString() : undefined,
        limit: 100,
      });
      setSales(response.items || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al cargar historial de ventas');
    } finally {
      setLoading(false);
    }
  }, [invoiceNumberFilter, statusFilter, fromDateFilter, toDateFilter]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const handleOpenReceipt = (sale: SaleDto) => {
    setSelectedSaleForReceipt(sale);
    setReceiptDialogOpen(true);
  };

  const handleOpenCancel = (sale: SaleDto) => {
    setSaleToCancel(sale);
    setCancelReason('');
    setCancelDialogOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!saleToCancel) return;
    if (cancelReason.trim().length < 5) {
      setErrorMsg('El motivo de anulación debe tener al menos 5 caracteres');
      return;
    }

    setActionLoading(true);
    try {
      await cancelSale(saleToCancel.id, cancelReason.trim());
      setToastMsg(`Venta ${saleToCancel.invoiceNumber} anulada correctamente.`);
      setCancelDialogOpen(false);
      setSaleToCancel(null);
      setCancelReason('');
      await loadSales();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al anular la venta');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, margin: '0 auto' }}>
      {/* Encabezado y Navegación rápida */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HomeBackButton />
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
              Historial de Ventas
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Auditoría de transacciones, consulta de comprobantes y anulación con reversión de lotes
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <PermissionGate permission={SYSTEM_PERMISSIONS.SALES_CREATE}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/pos')}
              sx={{ fontWeight: 'bold' }}
              data-testid="go-to-pos-btn"
            >
              Abrir Punto de Venta (POS)
            </Button>
          </PermissionGate>
        </Box>
      </Box>

      {/* Alerta de Error */}
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {/* Barra de Filtros */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            label="Buscar por N° Comprobante"
            variant="outlined"
            size="small"
            value={invoiceNumberFilter}
            onChange={(e) => setInvoiceNumberFilter(e.target.value)}
            placeholder="Ej: VEN-202609..."
            sx={{ minWidth: 260 }}
            data-testid="filter-invoice-input"
          />

          <TextField
            select
            label="Estado"
            variant="outlined"
            size="small"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | SaleStatus)}
            sx={{ minWidth: 160 }}
            data-testid="filter-status-select"
          >
            <MenuItem value="ALL">Todos los Estados</MenuItem>
            <MenuItem value="COMPLETED">Completada</MenuItem>
            <MenuItem value="CANCELLED">Anulada</MenuItem>
          </TextField>

          <TextField
            label="Desde"
            type="date"
            size="small"
            value={fromDateFilter}
            onChange={(e) => setFromDateFilter(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            data-testid="filter-from-date"
          />

          <TextField
            label="Hasta"
            type="date"
            size="small"
            value={toDateFilter}
            onChange={(e) => setToDateFilter(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            data-testid="filter-to-date"
          />

          <Button
            variant="outlined"
            onClick={loadSales}
            disabled={loading}
            data-testid="filter-refresh-btn"
          >
            Actualizar
          </Button>

          {(invoiceNumberFilter || statusFilter !== 'ALL' || fromDateFilter || toDateFilter) && (
            <Button
              variant="text"
              color="inherit"
              onClick={() => {
                setInvoiceNumberFilter('');
                setStatusFilter('ALL');
                setFromDateFilter('');
                setToDateFilter('');
              }}
            >
              Limpiar Filtros
            </Button>
          )}
        </Box>
      </Paper>

      {/* Tabla de Ventas */}
      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 800 }}>
          <TableHead sx={{ backgroundColor: 'action.hover' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Fecha / Hora</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>N° Comprobante</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Cliente</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Medio de Pago</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>Estado</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>Vendedor</TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={36} />
                  <Typography variant="body2" sx={{ mt: 1 }}>Cargando ventas...</Typography>
                </TableCell>
              </TableRow>
            ) : sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">No se encontraron ventas registradas con los criterios seleccionados.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              sales.map((sale) => (
                <TableRow key={sale.id} hover>
                  <TableCell>
                    {new Date(sale.createdAt).toLocaleString('es-CO', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{sale.invoiceNumber}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {sale.customerName || 'Cliente General'}
                    </Typography>
                    {sale.customerDocument && (
                      <Typography variant="caption" color="text.secondary">
                        Doc: {sale.customerDocument}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={sale.paymentMethod}
                      size="small"
                      variant="outlined"
                      color="default"
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                    ${sale.total.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={sale.status === 'COMPLETED' ? 'Completada' : 'Anulada'}
                      size="small"
                      color={sale.status === 'COMPLETED' ? 'success' : 'error'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">{sale.createdByUsername || 'Sistema'}</Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                      <Tooltip title="Ver Comprobante / Reimprimir">
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleOpenReceipt(sale)}
                          data-testid={`view-receipt-btn-${sale.id}`}
                        >
                          Comprobante
                        </Button>
                      </Tooltip>

                      {sale.status === 'COMPLETED' && (
                        <PermissionGate permission={SYSTEM_PERMISSIONS.SALES_CANCEL}>
                          <Tooltip title="Anular venta y restituir lotes">
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              onClick={() => handleOpenCancel(sale)}
                              data-testid={`cancel-sale-btn-${sale.id}`}
                            >
                              Anular
                            </Button>
                          </Tooltip>
                        </PermissionGate>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Modal Diálogo de Reimpresión de Comprobante (HU-018) */}
      <SaleReceiptDialog
        open={receiptDialogOpen}
        sale={selectedSaleForReceipt}
        onClose={() => {
          setReceiptDialogOpen(false);
          setSelectedSaleForReceipt(null);
        }}
      />

      {/* Modal Diálogo de Anulación de Venta (HU-019) */}
      <Dialog
        open={cancelDialogOpen}
        onClose={() => !actionLoading && setCancelDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        data-testid="cancel-sale-dialog"
      >
        <DialogTitle sx={{ fontWeight: 'bold', color: 'error.main' }}>
          Anulación de Venta
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>ADVERTENCIA:</strong> Esta acción restituirá el stock automáticamente a los lotes originales y registrará el egreso correspondiente en la caja activa. Esta operación es irreversible.
          </Alert>

          <DialogContentText sx={{ mb: 2 }}>
            ¿Está seguro de que desea anular la venta con comprobante <strong>{saleToCancel?.invoiceNumber}</strong> por un total de <strong>${saleToCancel?.total.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</strong>?
          </DialogContentText>

          <TextField
            label="Motivo de la anulación (Obligatorio)"
            fullWidth
            required
            multiline
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Indique la justificación técnica o comercial (ej. Error en digitación de producto por el cliente)..."
            helperText="Mínimo 5 caracteres para auditoría"
            disabled={actionLoading}
            data-testid="cancel-reason-input"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setCancelDialogOpen(false)}
            disabled={actionLoading}
            color="inherit"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmCancel}
            disabled={actionLoading || cancelReason.trim().length < 5}
            color="error"
            variant="contained"
            data-testid="confirm-cancel-sale-btn"
          >
            {actionLoading ? <CircularProgress size={20} color="inherit" /> : 'Confirmar Anulación'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast de Éxito */}
      <Snackbar
        open={Boolean(toastMsg)}
        autoHideDuration={4000}
        onClose={() => setToastMsg(null)}
        message={toastMsg}
      />
    </Box>
  );
};
