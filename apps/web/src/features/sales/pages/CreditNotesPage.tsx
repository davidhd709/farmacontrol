import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Stack,
  Divider,
} from '@mui/material';
import type { CreditNoteDto, CreditNoteStatus } from '@farmacia/contracts';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { fetchCreditNotes, cancelCreditNote } from '../api/sales.api';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { PermissionGate } from '../../auth/components/PermissionGate';
import { SweetModal } from '../../../components/SweetModal';
import { formatDateTime } from '../../../utils/date-format';
import { FilterBar } from '../../../components/layout/FilterBar';
import { DateField } from '../../../components/DateField';

const REFUND_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CREDITO_CARTERA: 'Cartera',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const CreditNotesPage: React.FC = () => {
  const [creditNotes, setCreditNotes] = useState<CreditNoteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtros locales
  const [numberFilter, setNumberFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CreditNoteStatus>('ALL');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  // Modal Detalle
  const [selectedNote, setSelectedNote] = useState<CreditNoteDto | null>(null);

  // Diálogo Anular Nota
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [noteToCancel, setNoteToCancel] = useState<CreditNoteDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Notificación Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadCreditNotes = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchCreditNotes();
      setCreditNotes(data || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al cargar notas crédito');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCreditNotes();
  }, [loadCreditNotes]);

  // Filtrado reactivo en memoria
  const filteredNotes = useMemo(() => {
    return creditNotes.filter((note) => {
      if (numberFilter.trim()) {
        const query = numberFilter.trim().toLowerCase();
        const matchesNumber = note.creditNoteNumber.toLowerCase().includes(query);
        const matchesSale = (note.saleInvoiceNumber || '').toLowerCase().includes(query);
        if (!matchesNumber && !matchesSale) return false;
      }

      if (clientFilter.trim()) {
        const query = clientFilter.trim().toLowerCase();
        const matchesCustomer = (note.customerName || '').toLowerCase().includes(query);
        const matchesDoc = (note.customerDocument || '').toLowerCase().includes(query);
        if (!matchesCustomer && !matchesDoc) return false;
      }

      if (statusFilter !== 'ALL' && note.status !== statusFilter) {
        return false;
      }

      if (fromDateFilter) {
        const noteDate = note.createdAt.split('T')[0];
        if (noteDate < fromDateFilter) return false;
      }

      if (toDateFilter) {
        const noteDate = note.createdAt.split('T')[0];
        if (noteDate > toDateFilter) return false;
      }

      return true;
    });
  }, [creditNotes, numberFilter, clientFilter, statusFilter, fromDateFilter, toDateFilter]);

  const handleOpenCancel = (note: CreditNoteDto) => {
    setNoteToCancel(note);
    setCancelReason('');
    setCancelDialogOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!noteToCancel) return;
    if (cancelReason.trim().length < 5) {
      setErrorMsg('El motivo de anulación debe tener al menos 5 caracteres.');
      return;
    }

    setActionLoading(true);
    try {
      const cancelled = await cancelCreditNote(noteToCancel.id, cancelReason.trim());
      setCancelDialogOpen(false);
      setNoteToCancel(null);
      setToastMsg(`Nota crédito ${cancelled.creditNoteNumber} anulada correctamente.`);
      await loadCreditNotes();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al anular la nota crédito');
    } finally {
      setActionLoading(false);
    }
  };

  // Métricas rápidas
  const totalAmount = useMemo(() => {
    return filteredNotes
      .filter((n) => n.status === 'CONFIRMADA')
      .reduce((sum, n) => sum + Number(n.total), 0);
  }, [filteredNotes]);

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Encabezado */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HomeBackButton />
          <Typography variant="h5" component="h1" sx={{ fontWeight: 'bold' }}>
            Notas Crédito
          </Typography>
        </Box>
      </Box>

      {/* Banner Informativo */}
      <Alert severity="info" sx={{ mb: 3 }}>
        Este apartado administra las devoluciones de ventas a clientes. Cada nota crédito confirmada
        reintegra el inventario devuelto a su lote correspondiente, revierte los saldos de dinero o
        cartera y genera el asiento contable de reversión de forma automática.
      </Alert>

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {/* Tarjetas de Métricas */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Total Devoluciones
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            {filteredNotes.length} documento(s)
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Notas Confirmadas
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'success.main' }}>
            {filteredNotes.filter((n) => n.status === 'CONFIRMADA').length}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Notas Anuladas
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'error.main' }}>
            {filteredNotes.filter((n) => n.status === 'ANULADA').length}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Monto Vigente Devuelto
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
            {formatCurrency(totalAmount)}
          </Typography>
        </Paper>
      </Stack>

      {/* Barra de Filtros */}
      <FilterBar sx={{ mb: 3 }}>
        <TextField
          label="Nota o Factura"
          placeholder="NC-... o VEN-..."
          size="small"
          value={numberFilter}
          onChange={(e) => setNumberFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        />

        <TextField
          label="Cliente o Documento"
          placeholder="Nombre o NIT / Cédula"
          size="small"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          sx={{ minWidth: 180 }}
        />

        <TextField
          select
          label="Estado"
          size="small"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | CreditNoteStatus)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="ALL">Todos</MenuItem>
          <MenuItem value="CONFIRMADA">Confirmada</MenuItem>
          <MenuItem value="ANULADA">Anulada</MenuItem>
        </TextField>

        <DateField
          label="Desde"
          size="small"
          value={fromDateFilter}
          onChange={(val) => setFromDateFilter(val)}
          sx={{ minWidth: 150 }}
        />

        <DateField
          label="Hasta"
          size="small"
          value={toDateFilter}
          onChange={(val) => setToDateFilter(val)}
          sx={{ minWidth: 150 }}
        />

        {(numberFilter || clientFilter || statusFilter !== 'ALL' || fromDateFilter || toDateFilter) && (
          <Button
            variant="text"
            size="small"
            onClick={() => {
              setNumberFilter('');
              setClientFilter('');
              setStatusFilter('ALL');
              setFromDateFilter('');
              setToDateFilter('');
            }}
          >
            Limpiar Filtros
          </Button>
        )}
      </FilterBar>

      {/* Tabla de Notas Crédito */}
      <TableContainer component={Paper} variant="outlined">
        <Table sx={{ minWidth: 800 }} size="small">
          <TableHead sx={{ bgcolor: 'grey.50' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Número</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Fecha</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Factura</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Cliente</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Reembolso</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Motivo</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="right">
                Total
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">
                Estado
              </TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">
                Acciones
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Cargando notas crédito…
                  </Typography>
                </TableCell>
              </TableRow>
            ) : filteredNotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                  <Typography variant="body1" color="text.secondary">
                    No se encontraron notas crédito registradas.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredNotes.map((note) => (
                <TableRow key={note.id} hover>
                  <TableCell sx={{ fontWeight: 'bold' }}>{note.creditNoteNumber}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatDateTime(note.createdAt)}
                  </TableCell>
                  <TableCell>{note.saleInvoiceNumber || '—'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      {note.customerName || 'Consumidor Final'}
                    </Typography>
                    {note.customerDocument && (
                      <Typography variant="caption" color="text.secondary">
                        Doc: {note.customerDocument}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{REFUND_LABELS[note.refundMethod] ?? note.refundMethod}</TableCell>
                  <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Tooltip title={note.reason}>
                      <span>{note.reason}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {formatCurrency(note.total)}
                  </TableCell>
                  <TableCell align="center">
                    {note.status === 'ANULADA' ? (
                      <Chip label="Anulada" color="default" size="small" variant="outlined" />
                    ) : (
                      <Chip label="Confirmada" color="success" size="small" />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setSelectedNote(note)}
                        data-testid={`view-detail-btn-${note.id}`}
                      >
                        Ver Detalle
                      </Button>

                      {note.status === 'CONFIRMADA' && (
                        <PermissionGate permission={SYSTEM_PERMISSIONS.SALES_CANCEL}>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleOpenCancel(note)}
                            data-testid={`cancel-note-btn-${note.id}`}
                          >
                            Anular
                          </Button>
                        </PermissionGate>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Modal Detalle de la Nota Crédito */}
      <Dialog
        open={Boolean(selectedNote)}
        onClose={() => setSelectedNote(null)}
        maxWidth="md"
        fullWidth
        data-testid="credit-note-detail-dialog"
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          Detalle de Nota Crédito {selectedNote?.creditNoteNumber}
        </DialogTitle>
        <DialogContent dividers>
          {selectedNote && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{ justifyContent: 'space-between' }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Factura Afectada
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {selectedNote.saleInvoiceNumber || '—'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Cliente
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      {selectedNote.customerName || 'Consumidor Final'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Método de Reembolso
                    </Typography>
                    <Typography variant="body2">
                      {REFUND_LABELS[selectedNote.refundMethod] ?? selectedNote.refundMethod}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Reintegro de Inventario
                    </Typography>
                    <Typography variant="body2">
                      {selectedNote.restock ? 'Sí (Afecta Stock)' : 'No'}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Motivo de la Devolución:
                </Typography>
                <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 0.5 }}>
                  "{selectedNote.reason}"
                </Typography>
              </Box>

              {selectedNote.status === 'ANULADA' && (
                <Alert severity="error">
                  Esta nota fue anulada el {formatDateTime(selectedNote.cancelledAt || '')}. Motivo:{' '}
                  <strong>{selectedNote.cancellationReason}</strong>
                </Alert>
              )}

              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
                Productos Devueltos
              </Typography>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.50' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Producto</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Lote</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">
                        Cant.
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">
                        Precio Unit.
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">
                        Subtotal
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">
                        IVA
                      </TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }} align="right">
                        Total
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(selectedNote.lines || []).map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                            {line.productName || line.productId}
                          </Typography>
                        </TableCell>
                        <TableCell>{line.lotNumber || '—'}</TableCell>
                        <TableCell align="right">{line.quantityCommercial}</TableCell>
                        <TableCell align="right">{formatCurrency(line.unitPrice)}</TableCell>
                        <TableCell align="right">{formatCurrency(line.subtotal)}</TableCell>
                        <TableCell align="right">{formatCurrency(line.taxAmount)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          {formatCurrency(line.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                <Paper variant="outlined" sx={{ p: 2, minWidth: 240 }}>
                  <Stack spacing={1}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Subtotal:
                      </Typography>
                      <Typography variant="body2">
                        {formatCurrency(selectedNote.subtotal)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        IVA:
                      </Typography>
                      <Typography variant="body2">
                        {formatCurrency(selectedNote.taxTotal)}
                      </Typography>
                    </Box>
                    <Divider />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                        Total Devuelto:
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: 'bold', color: 'primary.main' }}
                      >
                        {formatCurrency(selectedNote.total)}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setSelectedNote(null)} variant="outlined">
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Anulación de Nota Crédito */}
      <Dialog
        open={cancelDialogOpen}
        onClose={() => !actionLoading && setCancelDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        data-testid="cancel-credit-note-dialog"
      >
        <DialogTitle sx={{ fontWeight: 'bold', color: 'error.main' }}>
          Anular Nota Crédito {noteToCancel?.creditNoteNumber}
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>ADVERTENCIA:</strong> Anular esta nota crédito reversará sus efectos: si
            reintegró inventario la mercancía volverá a salir de los lotes originales, si se
            reembolsó dinero o cartera se reversará el saldo correspondiente y se reversará su
            asiento contable. Esta operación es definitiva.
          </Alert>

          <TextField
            autoFocus
            label="Motivo de anulación *"
            fullWidth
            multiline
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Indica detalladamente por qué se anula esta devolución (mínimo 5 caracteres)…"
            disabled={actionLoading}
            error={cancelReason.length > 0 && cancelReason.trim().length < 5}
            helperText={
              cancelReason.length > 0 && cancelReason.trim().length < 5
                ? 'El motivo debe tener al menos 5 caracteres.'
                : undefined
            }
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setCancelDialogOpen(false)} disabled={actionLoading}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmCancel}
            disabled={actionLoading || cancelReason.trim().length < 5}
          >
            {actionLoading ? 'Anulando…' : 'Confirmar Anulación'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast Modal */}
      <SweetModal
        open={Boolean(toastMsg)}
        type="success"
        title="¡Operación Exitosa!"
        text={toastMsg || ''}
        confirmText="Aceptar"
        onConfirm={() => setToastMsg(null)}
        onClose={() => setToastMsg(null)}
      />
    </Box>
  );
};
