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
} from '@mui/material';
import { Link } from 'react-router-dom';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import TuneIcon from '@mui/icons-material/Tune';
import { HomeBackButton } from '../../../components/HomeBackButton';

import type {
  InventoryMovementDto,
  ProductDto,
} from '@farmacia/contracts';
import { fetchInventoryMovements } from '../api/inventory.api';
import { fetchProducts } from '../../catalog/api/products.api';

export const InventoryMovementsPage = () => {
  const [movements, setMovements] = useState<InventoryMovementDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filtros
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedType, setSelectedType] = useState('');

  const loadFilterData = useCallback(async () => {
    try {
      const prodRes = await fetchProducts({ pageSize: 100 });
      setProducts(prodRes.items || []);
    } catch (err: any) {
      console.error('Error cargando catálogo:', err);
    }
  }, []);

  const loadMovements = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetchInventoryMovements({
        productId: selectedProductId || undefined,
        movementType: selectedType || undefined,
        page: page + 1,
        pageSize,
      });
      setMovements(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al consultar el historial de movimientos.');
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, selectedType, page, pageSize]);

  useEffect(() => {
    loadFilterData();
  }, [loadFilterData]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const getMovementMeta = (type: string) => {
    if (type.startsWith('ENTRADA') || type.startsWith('AJUSTE_POSITIVO')) {
      return {
        color: 'success' as const,
        icon: <ArrowDownwardIcon fontSize="small" />,
      };
    }
    if (type.startsWith('SALIDA') || type.startsWith('AJUSTE_NEGATIVO')) {
      return {
        color: 'error' as const,
        icon: <ArrowUpwardIcon fontSize="small" />,
      };
    }
    return {
      color: 'info' as const,
      icon: <TuneIcon fontSize="small" />,
    };
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, margin: '0 auto' }}>
      {/* Encabezado y Acciones */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HomeBackButton />
          <Box>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 800, color: 'text.primary' }}>
              Libro Mayor de Movimientos (Kardex)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Trazabilidad inmutable y auditoría de entradas, salidas y ajustes de inventario.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            component={Link}
            to="/inventory/lots"
            variant="outlined"
            size="small"
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              transition: 'transform 0.1s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            ← Volver a Lotes
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={loadMovements}
            disabled={loading}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              transition: 'transform 0.1s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            Actualizar
          </Button>
        </Box>
      </Box>

        {/* Filtros */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            <TextField
              select
              label="Filtrar por Producto"
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 260 }}
              size="small"
            >
              <MenuItem value="">Todos los productos</MenuItem>
              {products.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Tipo de Movimiento"
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 200 }}
              size="small"
            >
              <MenuItem value="">Todos los tipos</MenuItem>
              <MenuItem value="ENTRADA_COMPRA">Entrada por Compra</MenuItem>
              <MenuItem value="SALIDA_VENTA">Salida por Venta</MenuItem>
              <MenuItem value="AJUSTE_POSITIVO">Ajuste Positivo (+)</MenuItem>
              <MenuItem value="AJUSTE_NEGATIVO">Ajuste Negativo (-)</MenuItem>
            </TextField>
          </Box>
        </Paper>

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {errorMessage}
          </Alert>
        )}

        {/* Tabla Kardex */}
        <Paper variant="outlined">
          <TableContainer>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 6 }}>
                <CircularProgress />
              </Box>
            ) : movements.length === 0 ? (
              <Box sx={{ p: 6, textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary">
                  No se registran movimientos de inventario en el historial.
                </Typography>
              </Box>
            ) : (
              <>
                <Table size="medium">
                  <TableHead sx={{ backgroundColor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Fecha y Hora</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Tipo</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Producto y Lote</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Cantidad (Base)</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Saldo Resultante</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Referencia / Documento</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m.id} hover>
                        <TableCell sx={{ fontSize: '0.875rem' }}>
                          {new Date(m.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const meta = getMovementMeta(m.movementType);
                            return (
                              <Chip
                                size="small"
                                label={m.movementType}
                                color={meta.color}
                                icon={meta.icon}
                                variant="outlined"
                                sx={{ fontWeight: 600 }}
                              />
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {m.product?.name || 'Desconocido'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Lote: {m.lot?.lotNumber || 'S/L'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {m.quantityBaseUnits > 0 ? `+${m.quantityBaseUnits}` : m.quantityBaseUnits}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {m.balanceAfterBaseUnits}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.875rem' }}>
                          {m.referenceDocumentType
                            ? `${m.referenceDocumentType}: ${m.referenceDocumentId || ''}`
                            : m.notes || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  rowsPerPageOptions={[5, 10, 25, 50]}
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
                />
              </>
            )}
          </TableContainer>
        </Paper>
    </Box>
  );
};
