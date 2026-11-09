import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Typography,
  Box,
  Alert,
  Tooltip,
} from '@mui/material';
import type { SaleDto } from '@farmacia/contracts';
import { fetchSales } from '../api/sales.api';
import { formatDateTime } from '../../../utils/date-format';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectSale: (sale: SaleDto) => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const SelectSaleForCreditNoteDialog: React.FC<Props> = ({
  open,
  onClose,
  onSelectSale,
}) => {
  const [sales, setSales] = useState<SaleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSales = useCallback(async (query: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetchSales({
        invoiceNumber: query.trim() || undefined,
        limit: 50,
      });
      setSales(res.items || []);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al buscar facturas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setErrorMessage(null);
      void loadSales('');
    }
  }, [open, loadSales]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadSales(searchQuery);
  };

  const filteredSales = useMemo(() => {
    if (!searchQuery.trim()) return sales;
    const q = searchQuery.toLowerCase().trim();
    return sales.filter(
      (s) =>
        s.invoiceNumber.toLowerCase().includes(q) ||
        (s.customerName && s.customerName.toLowerCase().includes(q)) ||
        (s.customerDocument && s.customerDocument.includes(q)),
    );
  }, [sales, searchQuery]);

  const handleSelect = (sale: SaleDto) => {
    if (sale.status === 'CANCELLED') {
      setErrorMessage(`La factura ${sale.invoiceNumber} está anulada y no es elegible.`);
      return;
    }
    if (sale.status !== 'COMPLETED') {
      setErrorMessage(`La factura ${sale.invoiceNumber} debe estar completada para emitir notas crédito.`);
      return;
    }
    if (!sale.lines || sale.lines.length === 0) {
      setErrorMessage(`La factura ${sale.invoiceNumber} no contiene productos.`);
      return;
    }
    onSelectSale(sale);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      data-testid="select-sale-for-credit-note-dialog"
    >
      <DialogTitle sx={{ fontWeight: 'bold' }}>
        Seleccionar Factura para Nota Crédito
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Seleccione una factura completada para registrar la devolución y emitir la nota crédito.
          </Alert>

          {errorMessage && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMessage(null)}>
              {errorMessage}
            </Alert>
          )}

          <Box
            component="form"
            onSubmit={handleSearchSubmit}
            sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
          >
            <TextField
              size="small"
              fullWidth
              placeholder="Buscar por número de factura (ej. FAC-000001), cliente o documento…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              slotProps={{
                htmlInput: {
                  'aria-label': 'Buscar factura',
                },
              }}
            />
            <Button variant="outlined" type="submit" disabled={loading}>
              Buscar
            </Button>
          </Box>
        </Box>

        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 380 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Factura</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Fecha</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Cliente</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">
                  Total
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Método Pago</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">
                  Estado
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">
                  Acción
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Buscando facturas…
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No se encontraron facturas elegibles.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredSales.map((sale) => {
                  const isEligible = sale.status === 'COMPLETED';

                  return (
                    <TableRow key={sale.id} hover>
                      <TableCell sx={{ fontWeight: 'bold' }}>{sale.invoiceNumber}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(sale.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {sale.customerName || 'Consumidor Final'}
                        </Typography>
                        {sale.customerDocument && (
                          <Typography variant="caption" color="text.secondary">
                            {sale.customerDocument}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {formatCurrency(sale.total)}
                      </TableCell>
                      <TableCell>{sale.paymentMethod}</TableCell>
                      <TableCell align="center">
                        {sale.status === 'COMPLETED' ? (
                          <Chip label="Completada" color="success" size="small" />
                        ) : sale.status === 'CANCELLED' ? (
                          <Chip label="Anulada" color="default" size="small" variant="outlined" />
                        ) : (
                          <Chip label={sale.status} color="warning" size="small" />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {isEligible ? (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            onClick={() => handleSelect(sale)}
                            data-testid={`select-sale-btn-${sale.id}`}
                          >
                            Seleccionar
                          </Button>
                        ) : (
                          <Tooltip title="Factura no elegible: solo facturas completadas pueden recibir notas crédito">
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                disabled
                                data-testid={`select-sale-btn-${sale.id}`}
                              >
                                No elegible
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} variant="outlined">
          Cancelar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

