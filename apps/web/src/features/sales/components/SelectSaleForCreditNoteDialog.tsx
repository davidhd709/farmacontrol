import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  TablePagination,
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
  const [activeSearch, setActiveSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Paginación desde backend
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);

  // Control de concurrencia y ciclo de vida de apertura del diálogo
  const requestIdRef = useRef(0);
  const prevOpenRef = useRef(false);
  const pageSizeRef = useRef(pageSize);
  pageSizeRef.current = pageSize;

  const loadSales = useCallback(
    async (queryText: string, pageNumber: number, limitNumber: number) => {
      const currentRequestId = ++requestIdRef.current;
      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetchSales({
          search: queryText.trim() || undefined,
          page: pageNumber,
          limit: limitNumber,
        });
        // Si otra petición se emitió después, descartar esta respuesta obsoleta (evita sobrescrituras)
        if (currentRequestId !== requestIdRef.current) {
          return;
        }
        setSales(res.items || []);
        setTotalItems(res.total || 0);
        setPage(res.page || 1);
        setActiveSearch(queryText.trim());
      } catch (err: unknown) {
        if (currentRequestId !== requestIdRef.current) {
          return;
        }
        setErrorMessage(err instanceof Error ? err.message : 'Error al buscar facturas');
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    // Se ejecuta únicamente cuando el diálogo se abre (transición de false a true o montaje inicial abierto)
    if (open && !prevOpenRef.current) {
      setSearchQuery('');
      setActiveSearch('');
      setErrorMessage(null);
      setPage(1);
      void loadSales('', 1, pageSizeRef.current);
    } else if (!open && prevOpenRef.current) {
      // Al cerrar el diálogo, invalidar peticiones en curso y limpiar errores
      requestIdRef.current++;
      setLoading(false);
      setErrorMessage(null);
    }
    prevOpenRef.current = open;
  }, [open, loadSales]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void loadSales(searchQuery, 1, pageSize);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setPage(1);
    void loadSales('', 1, pageSize);
  };

  const handlePageChange = (_: unknown, newPage0: number) => {
    void loadSales(activeSearch, newPage0 + 1, pageSize);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLimit = parseInt(e.target.value, 10);
    setPageSize(newLimit);
    setPage(1);
    void loadSales(activeSearch, 1, newLimit);
  };

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
            Puede buscar por número de factura, nombre del cliente o documento de identidad.
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
              placeholder="Buscar por número de factura (ej. FAC-000001), nombre o documento del cliente…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              slotProps={{
                htmlInput: {
                  'aria-label': 'Buscar factura',
                  'data-testid': 'sale-search-input',
                },
              }}
            />
            <Button
              variant="contained"
              type="submit"
              data-testid="search-sale-submit-btn"
            >
              Buscar
            </Button>
            {activeSearch && (
              <Button
                variant="outlined"
                onClick={handleClearSearch}
                data-testid="clear-sale-search-btn"
              >
                Limpiar
              </Button>
            )}
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
              ) : sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No se encontraron facturas elegibles.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => {
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

        <TablePagination
          component="div"
          count={totalItems}
          page={Math.max(0, page - 1)}
          onPageChange={handlePageChange}
          rowsPerPage={pageSize}
          onRowsPerPageChange={handleRowsPerPageChange}
          rowsPerPageOptions={[10, 20, 50]}
          labelRowsPerPage="Filas por página:"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}–${to} de ${count !== -1 ? count : `más de ${to}`}`
          }
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} variant="outlined">
          Cancelar
        </Button>
      </DialogActions>
    </Dialog>
  );
};
