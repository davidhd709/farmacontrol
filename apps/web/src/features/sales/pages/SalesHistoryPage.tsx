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
  CircularProgress,
  Alert,
  Link as MuiLink,
  Tooltip,
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { SaleDto, SaleStatus } from '@farmacia/contracts';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { fetchSales } from '../api/sales.api';
import { CancelSaleDialog } from '../components/CancelSaleDialog';
import { StatusChip } from '../../../components/StatusChip';
import { formatCop } from '../../../utils/money';
import { SALE_STATUS_LABELS, paymentMethodLabel } from '../sale-labels';
import { SaleReceiptDialog } from '../components/SaleReceiptDialog';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { PermissionGate } from '../../auth/components/PermissionGate';
import { SweetModal } from '../../../components/SweetModal';
import { CreditNoteDialog } from '../components/CreditNoteDialog';
import { SaleCreditNotesDialog } from '../components/SaleCreditNotesDialog';
import { SaleActionHistoryDialog } from '../components/SaleActionHistoryDialog';
import { businessDayEnd, businessDayStart } from '../../../utils/business-date';
import { formatDateTime } from '../../../utils/date-format';
import { FilterBar } from '../../../components/layout/FilterBar';
import { DateField } from '../../../components/DateField';

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

  // Anulación de venta
  const [saleToCancel, setSaleToCancel] = useState<SaleDto | null>(null);

  // Notificaciones Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Nota Crédito (devolución parcial)
  const [saleForCreditNote, setSaleForCreditNote] = useState<SaleDto | null>(null);
  const [saleForNotes, setSaleForNotes] = useState<SaleDto | null>(null);

  // Historial de Acciones (REQ-006)
  const [saleForHistory, setSaleForHistory] = useState<SaleDto | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const loadSales = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetchSales({
        invoiceNumber: invoiceNumberFilter.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        fromDate: fromDateFilter ? businessDayStart(fromDateFilter) : undefined,
        toDate: toDateFilter ? businessDayEnd(toDateFilter) : undefined,
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

  const handleOpenHistory = (sale: SaleDto) => {
    setSaleForHistory(sale);
    setHistoryDialogOpen(true);
  };

  const handleOpenCancel = (sale: SaleDto) => {
    setSaleToCancel(sale);
  };

  return (
    <Box sx={{ py: { xs: 1, md: 2 }, maxWidth: 1400, margin: '0 auto' }}>
      {/* Encabezado y Navegación rápida */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HomeBackButton />
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
              Historial de Ventas
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Auditoría de transacciones, consulta de comprobantes y anulación con reversión de
              lotes
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
      <FilterBar
        sx={{ mb: 3 }}
        actions={
          <>
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
          </>
        }
      >
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

        <DateField
          label="Desde"
          size="small"
          value={fromDateFilter}
          onChange={(value) => setFromDateFilter(value)}
          data-testid="filter-from-date"
        />

        <DateField
          label="Hasta"
          size="small"
          value={toDateFilter}
          onChange={(value) => setToDateFilter(value)}
          data-testid="filter-to-date"
        />
      </FilterBar>

      {/* Tabla de Ventas */}
      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 800 }}>
          <TableHead sx={{ backgroundColor: 'action.hover' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Fecha / Hora</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>N° Comprobante</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Cliente</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Medio de Pago</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                Total
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                Estado
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                Vendedor
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                Acciones
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={36} />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Cargando ventas...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">
                    No se encontraron ventas registradas con los criterios seleccionados.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              sales.map((sale) => (
                <TableRow key={sale.id} hover>
                  <TableCell>{formatDateTime(sale.createdAt)}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>
                    <MuiLink
                      component={RouterLink}
                      to={`/sales/${sale.id}`}
                      underline="hover"
                      data-testid={`sale-detail-link-${sale.id}`}
                    >
                      {sale.invoiceNumber}
                    </MuiLink>
                  </TableCell>
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
                  <TableCell>{paymentMethodLabel(sale.paymentMethod)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1rem' }}>
                    {formatCop(sale.total)}
                  </TableCell>
                  <TableCell align="center">
                    <StatusChip
                      label={SALE_STATUS_LABELS[sale.status].label}
                      tone={SALE_STATUS_LABELS[sale.status].tone}
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

                      <Tooltip title="Consultar historial cronológico de acciones de la factura">
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleOpenHistory(sale)}
                          data-testid={`action-history-btn-${sale.id}`}
                        >
                          Historial de Acciones
                        </Button>
                      </Tooltip>

                      {sale.status === 'COMPLETED' && (
                        <PermissionGate permission={SYSTEM_PERMISSIONS.SALES_CREDIT_NOTE}>
                          <Tooltip title="Devolución parcial con nota crédito">
                            <Button
                              variant="outlined"
                              color="warning"
                              size="small"
                              onClick={() => setSaleForCreditNote(sale)}
                              data-testid={`credit-note-btn-${sale.id}`}
                            >
                              Devolución
                            </Button>
                          </Tooltip>
                        </PermissionGate>
                      )}

                      <Tooltip title="Notas crédito de la venta y su anulación">
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => setSaleForNotes(sale)}
                          data-testid={`credit-notes-btn-${sale.id}`}
                        >
                          Notas crédito
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

      {/* Anulación de venta (HU-019) */}
      <CancelSaleDialog
        sale={saleToCancel}
        onClose={() => setSaleToCancel(null)}
        onCancelled={(cancelled) => {
          setSaleToCancel(null);
          setToastMsg(`Venta ${cancelled.invoiceNumber} anulada correctamente.`);
          void loadSales();
        }}
      />

      {/* Nota Crédito / Devolución parcial (RF-033) */}
      <CreditNoteDialog
        open={Boolean(saleForCreditNote)}
        sale={saleForCreditNote}
        onClose={() => setSaleForCreditNote(null)}
        onCreated={(number, exchangeCreditNoteId) => {
          setSaleForCreditNote(null);
          if (exchangeCreditNoteId) {
            navigate(`/pos?cambio=${encodeURIComponent(exchangeCreditNoteId)}`);
            return;
          }
          setToastMsg(`Nota crédito ${number} registrada correctamente.`);
          void loadSales();
        }}
      />

      {/* Devoluciones de la venta y su anulación */}
      {saleForNotes && (
        <SaleCreditNotesDialog
          sale={saleForNotes}
          onClose={() => setSaleForNotes(null)}
          onCancelled={(note) => {
            setToastMsg(`Nota crédito ${note.creditNoteNumber} anulada.`);
            void loadSales();
          }}
        />
      )}

      {/* Historial de Acciones de la factura (REQ-006) */}
      <SaleActionHistoryDialog
        open={historyDialogOpen}
        saleId={saleForHistory?.id || null}
        invoiceNumber={saleForHistory?.invoiceNumber || null}
        onClose={() => {
          setHistoryDialogOpen(false);
          setSaleForHistory(null);
        }}
      />

      {/* Notificación modal estilo SweetAlert2 */}
      <SweetModal
        open={Boolean(toastMsg)}
        type="success"
        title="¡Buen trabajo!"
        text={toastMsg || ''}
        confirmText="OK"
        onConfirm={() => setToastMsg(null)}
        onClose={() => setToastMsg(null)}
      />
    </Box>
  );
};
