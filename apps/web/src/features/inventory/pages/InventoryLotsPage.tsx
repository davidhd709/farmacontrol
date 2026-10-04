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
import CancelIcon from '@mui/icons-material/Cancel';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { HomeBackButton } from '../../../components/HomeBackButton';

import type { InventoryLotDto, LocationDto, ProductDto } from '@farmacia/contracts';
import { fetchInventoryLots, fetchLocations } from '../api/inventory.api';
import { fetchProducts } from '../../catalog/api/products.api';
import { CreateLotDialog } from '../components/CreateLotDialog';
import { AdjustInventoryDialog } from '../components/AdjustInventoryDialog';

export const InventoryLotsPage = () => {
  const [lots, setLots] = useState<InventoryLotDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filtros
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [lotNumberSearch, setLotNumberSearch] = useState('');
  const [hasStockOnly, setHasStockOnly] = useState(false);

  // Dialogs
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);

  const loadFilterData = useCallback(async () => {
    try {
      const [prodRes, locRes] = await Promise.all([
        fetchProducts({ pageSize: 100 }),
        fetchLocations(),
      ]);
      setProducts(prodRes.items || []);
      setLocations(locRes || []);
    } catch (err: any) {
      console.error('Error cargando catálogos para filtros:', err);
    }
  }, []);

  const loadLots = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetchInventoryLots({
        productId: selectedProductId || undefined,
        locationId: selectedLocationId || undefined,
        lotNumber: lotNumberSearch || undefined,
        hasStockOnly,
        page: page + 1,
        pageSize,
      });
      setLots(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al consultar lotes de inventario.');
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, selectedLocationId, lotNumberSearch, hasStockOnly, page, pageSize]);

  useEffect(() => {
    loadFilterData();
  }, [loadFilterData]);

  useEffect(() => {
    loadLots();
  }, [loadLots]);

  const calculateStatus = (expirationDateStr: string, currentQuantity: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(expirationDateStr);
    expDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: 'VENCIDO',
        color: 'error' as const,
        icon: <CancelIcon fontSize="small" />,
      };
    }
    if (diffDays <= 30) {
      return {
        label: `Por vencer (${diffDays}d)`,
        color: 'error' as const,
        icon: <WarningAmberIcon fontSize="small" />,
      };
    }
    if (diffDays <= 90) {
      return {
        label: `Atención (${diffDays}d)`,
        color: 'warning' as const,
        icon: <AccessTimeIcon fontSize="small" />,
      };
    }
    if (currentQuantity === 0) {
      return {
        label: 'Agotado',
        color: 'default' as const,
        icon: <HourglassEmptyIcon fontSize="small" />,
      };
    }
    return {
      label: 'Vigente',
      color: 'success' as const,
      icon: <CheckCircleIcon fontSize="small" />,
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
              Gestión de Lotes y Vencimientos
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Monitoreo de existencias, almacén y fechas de vencimiento farmacéuticas con prioridad FEFO.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            component={Link}
            to="/inventory/movements"
            variant="outlined"
            size="small"
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              transition: 'transform 0.1s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            Ver Kardex
          </Button>
          <Button
            variant="outlined"
            color="warning"
            size="small"
            onClick={() => setIsAdjustOpen(true)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              transition: 'transform 0.1s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            Ajuste Manual
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={loadLots}
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
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => setIsCreateOpen(true)}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              transition: 'transform 0.1s ease, background-color 0.15s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            + Registrar Lote
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
              sx={{ minWidth: 240 }}
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
              label="Ubicación"
              value={selectedLocationId}
              onChange={(e) => {
                setSelectedLocationId(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 180 }}
              size="small"
            >
              <MenuItem value="">Todas las ubicaciones</MenuItem>
              {locations.map((loc) => (
                <MenuItem key={loc.id} value={loc.id}>
                  {loc.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Número de Lote"
              value={lotNumberSearch}
              onChange={(e) => {
                setLotNumberSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Buscar lote..."
              size="small"
              sx={{ minWidth: 180 }}
            />

            <TextField
              select
              label="Disponibilidad"
              value={hasStockOnly ? 'stock' : 'all'}
              onChange={(e) => {
                setHasStockOnly(e.target.value === 'stock');
                setPage(0);
              }}
              size="small"
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="all">Todos los saldos</MenuItem>
              <MenuItem value="stock">Con existencias (&gt;0)</MenuItem>
            </TextField>
          </Box>
        </Paper>

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {errorMessage}
          </Alert>
        )}

        {/* Tabla de Lotes */}
        <Paper variant="outlined">
          <TableContainer>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 6 }}>
                <CircularProgress />
              </Box>
            ) : lots.length === 0 ? (
              <Box sx={{ p: 6, textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary">
                  No se encontraron lotes de inventario con los criterios seleccionados.
                </Typography>
              </Box>
            ) : (
              <>
                <Table size="medium">
                  <TableHead sx={{ backgroundColor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Lote</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Ubicación</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">Vencimiento</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Existencia Actual</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="center">Estado FEFO</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lots.map((lot) => {
                      const status = calculateStatus(lot.expirationDate, lot.currentQuantity);
                      return (
                        <TableRow key={lot.id} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {lot.product?.name || 'Desconocido'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Código: {lot.product?.code || 'S/N'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                              {lot.lotNumber}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {lot.location?.name || 'Bodega Principal'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {lot.expirationDate}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {lot.currentQuantity} {lot.product?.baseUnit || 'UNIDADES'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              size="small"
                              label={status.label}
                              color={status.color}
                              icon={status.icon}
                              variant="outlined"
                              sx={{ fontWeight: 600 }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

        {/* Modal de Registro de Lote */}
        <CreateLotDialog
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            loadLots();
          }}
          products={products}
          locations={locations}
        />

        {/* Modal de Ajuste Manual de Inventario */}
        <AdjustInventoryDialog
          open={isAdjustOpen}
          onClose={() => setIsAdjustOpen(false)}
          onSuccess={() => {
            loadLots();
          }}
          products={products}
          lots={lots}
        />
    </Box>
  );
};
