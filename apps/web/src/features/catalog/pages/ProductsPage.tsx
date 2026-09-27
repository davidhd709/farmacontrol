import { useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  InputAdornment,
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
  TablePagination,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { SYSTEM_PERMISSIONS, type ProductDto } from '@farmacia/contracts';
import { PermissionGate } from '../../auth/components/PermissionGate';
import { useCategories } from '../hooks/useCategories';
import { useProducts } from '../hooks/useProducts';
import { ProductFormDialog } from '../components/ProductFormDialog';
import { DeactivateProductDialog } from '../components/DeactivateProductDialog';
import { ProductPresentationsDialog } from '../components/ProductPresentationsDialog';

type StatusFilterOption = 'active' | 'inactive' | 'all';
type LotFilterOption = 'all' | 'with_lot' | 'without_lot';

export function ProductsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [lotFilter, setLotFilter] = useState<LotFilterOption>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('active');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Dialogs
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDto | null>(null);
  const [productToDeactivate, setProductToDeactivate] = useState<ProductDto | null>(null);
  const [productForPresentations, setProductForPresentations] = useState<ProductDto | null>(null);

  const { data: categoriesData } = useCategories({ isActive: true, pageSize: 100 });
  const categories = categoriesData?.items ?? [];

  const queryFilters = {
    search: searchTerm.trim() || undefined,
    categoryId: selectedCategoryId === 'all' ? undefined : selectedCategoryId,
    requiresLotControl:
      lotFilter === 'all' ? undefined : lotFilter === 'with_lot',
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
    page: page + 1,
    pageSize,
  };

  const { data, isLoading, isError, error } = useProducts(queryFilters);

  const handleOpenCreate = () => {
    setSelectedProduct(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (product: ProductDto) => {
    setSelectedProduct(product);
    setIsFormOpen(true);
  };

  const handleOpenDeactivate = (product: ProductDto) => {
    setProductToDeactivate(product);
  };

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(0);
  };

  const products = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="static"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, alignItems: 'center' }}>
            <Button component={Link} to="/" color="inherit" sx={{ fontWeight: 700 }}>
              ← Inicio
            </Button>
            <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
              Catálogo / Productos
            </Typography>
          </Box>

          <PermissionGate permission={SYSTEM_PERMISSIONS.PRODUCTS_MANAGE}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleOpenCreate}
              data-testid="create-product-btn"
            >
              Nuevo Producto
            </Button>
          </PermissionGate>
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography component="h1" variant="h1">
              Catálogo de Productos
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              Administra el portafolio farmacéutico, atributos regulatorios y parámetros de control.
            </Typography>
          </Box>

          {isError ? (
            <Alert severity="error">
              {error instanceof Error
                ? error.message
                : 'No fue posible cargar el listado de productos. Intenta nuevamente.'}
            </Alert>
          ) : null}

          {/* Filtros de búsqueda, categoría, lotes y estado */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: '1fr 1fr',
                  md: '2fr 1.5fr 1fr 1fr',
                },
                gap: 2,
                alignItems: 'center',
              }}
            >
              <TextField
                id="product-search-input"
                label="Buscar producto"
                placeholder="Nombre, principio activo, SKU o código de barras..."
                size="small"
                value={searchTerm}
                onChange={handleSearchChange}
                slotProps={{
                  input: {
                    endAdornment: searchTerm ? (
                      <InputAdornment position="end">
                        <Button
                          size="small"
                          onClick={() => {
                            setSearchTerm('');
                            setPage(0);
                          }}
                          sx={{ minWidth: 'auto', p: 0.5 }}
                          aria-label="Limpiar búsqueda"
                        >
                          ✕
                        </Button>
                      </InputAdornment>
                    ) : null,
                  },
                }}
              />

              <FormControl size="small">
                <InputLabel id="category-filter-label">Categoría</InputLabel>
                <Select
                  labelId="category-filter-label"
                  id="category-filter-select"
                  value={selectedCategoryId}
                  label="Categoría"
                  onChange={(e) => {
                    setSelectedCategoryId(e.target.value);
                    setPage(0);
                  }}
                >
                  <MenuItem value="all">Todas las categorías</MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small">
                <InputLabel id="lot-filter-label">Control Lotes</InputLabel>
                <Select
                  labelId="lot-filter-label"
                  id="lot-filter-select"
                  value={lotFilter}
                  label="Control Lotes"
                  onChange={(e) => {
                    setLotFilter(e.target.value as LotFilterOption);
                    setPage(0);
                  }}
                >
                  <MenuItem value="all">Todos</MenuItem>
                  <MenuItem value="with_lot">Control FEFO</MenuItem>
                  <MenuItem value="without_lot">Sin lote</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small">
                <InputLabel id="status-filter-label">Estado</InputLabel>
                <Select
                  labelId="status-filter-label"
                  id="status-filter-select"
                  value={statusFilter}
                  label="Estado"
                  onChange={(e) => {
                    setStatusFilter(e.target.value as StatusFilterOption);
                    setPage(0);
                  }}
                >
                  <MenuItem value="active">Activos</MenuItem>
                  <MenuItem value="inactive">Inactivos</MenuItem>
                  <MenuItem value="all">Todos</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Paper>

          {/* Tabla de Productos */}
          <Paper variant="outlined">
            <TableContainer>
              <Table aria-label="Tabla del catálogo de productos">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Código (SKU)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Producto y Principio Activo</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Categoría</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">
                      Precio Base
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Control Lotes</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">
                      Acciones
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <CircularProgress size={32} />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Cargando catálogo de productos…
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          No se encontraron productos
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {searchTerm || selectedCategoryId !== 'all' || lotFilter !== 'all'
                            ? 'Prueba ajustando los filtros o el texto de búsqueda.'
                            : 'Aún no se han registrado productos en el catálogo.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((product) => (
                      <TableRow key={product.id} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {product.code}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {product.name}
                          </Typography>
                          {product.genericName || product.concentration ? (
                            <Typography variant="caption" color="text.secondary">
                              {[product.genericName, product.concentration]
                                .filter(Boolean)
                                .join(' • ')}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>
                          {product.categoryName || '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          ${parseFloat(product.basePrice).toLocaleString('es-CO', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={product.requiresLotControl ? 'Lote / FEFO' : 'Sin lote'}
                            color={product.requiresLotControl ? 'primary' : 'default'}
                            size="small"
                            variant={product.requiresLotControl ? 'filled' : 'outlined'}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={product.isActive ? 'Activo' : 'Inactivo'}
                            color={product.isActive ? 'success' : 'default'}
                            size="small"
                            variant={product.isActive ? 'filled' : 'outlined'}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <PermissionGate permission={SYSTEM_PERMISSIONS.PRODUCTS_MANAGE}>
                            <Box
                              sx={{
                                display: 'flex',
                                flexDirection: 'row',
                                gap: 1,
                                justifyContent: 'flex-end',
                              }}
                            >
                              <Button
                                size="small"
                                variant="outlined"
                                color="secondary"
                                onClick={() => setProductForPresentations(product)}
                                aria-label={`Presentaciones de ${product.name}`}
                                data-testid={`presentations-btn-${product.id}`}
                              >
                                Presentaciones
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => handleOpenEdit(product)}
                                aria-label={`Editar producto ${product.name}`}
                              >
                                Editar
                              </Button>
                              {product.isActive ? (
                                <Button
                                  size="small"
                                  color="error"
                                  variant="outlined"
                                  onClick={() => handleOpenDeactivate(product)}
                                  aria-label={`Inactivar producto ${product.name}`}
                                >
                                  Inactivar
                                </Button>
                              ) : null}
                            </Box>
                          </PermissionGate>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={total}
              rowsPerPage={pageSize}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage="Filas por página:"
              labelDisplayedRows={({ from, to, count }) =>
                `${from}–${to} de ${count !== -1 ? count : `más de ${to}`}`
              }
            />
          </Paper>
        </Stack>
      </Container>

      {/* Diálogos modales */}
      <ProductFormDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        product={selectedProduct}
        onManagePresentations={(p) => setProductForPresentations(p)}
      />

      <DeactivateProductDialog
        open={Boolean(productToDeactivate)}
        onClose={() => setProductToDeactivate(null)}
        product={productToDeactivate}
      />

      <ProductPresentationsDialog
        open={Boolean(productForPresentations)}
        onClose={() => setProductForPresentations(null)}
        product={productForPresentations}
      />
    </Box>
  );
}
