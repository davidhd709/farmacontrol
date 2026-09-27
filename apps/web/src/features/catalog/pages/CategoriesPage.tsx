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
import { SYSTEM_PERMISSIONS, type CategoryDto } from '@farmacia/contracts';
import { PermissionGate } from '../../auth/components/PermissionGate';
import { useCategories } from '../hooks/useCategories';
import { CategoryFormDialog } from '../components/CategoryFormDialog';
import { DeactivateCategoryDialog } from '../components/DeactivateCategoryDialog';

type StatusFilterOption = 'active' | 'inactive' | 'all';

export function CategoriesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('active');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryDto | null>(null);
  const [categoryToDeactivate, setCategoryToDeactivate] = useState<CategoryDto | null>(null);

  const queryFilters = {
    search: searchTerm.trim() || undefined,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
    page: page + 1,
    pageSize,
  };

  const { data, isLoading, isError, error } = useCategories(queryFilters);

  const handleOpenCreate = () => {
    setSelectedCategory(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (category: CategoryDto) => {
    setSelectedCategory(category);
    setIsFormOpen(true);
  };

  const handleOpenDeactivate = (category: CategoryDto) => {
    setCategoryToDeactivate(category);
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

  const handleStatusFilterChange = (newStatus: StatusFilterOption) => {
    setStatusFilter(newStatus);
    setPage(0);
  };

  const categories = data?.items ?? [];
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
              Catálogo / Categorías
            </Typography>
          </Box>

          <PermissionGate permission={SYSTEM_PERMISSIONS.CATEGORIES_MANAGE}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleOpenCreate}
              data-testid="create-category-btn"
            >
              Nueva Categoría
            </Button>
          </PermissionGate>
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography component="h1" variant="h1">
              Categorías de Productos
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              Administra las clasificaciones y familias de productos del inventario farmacéutico.
            </Typography>
          </Box>

          {isError ? (
            <Alert severity="error">
              {error instanceof Error
                ? error.message
                : 'No fue posible cargar las categorías. Intenta nuevamente.'}
            </Alert>
          ) : null}

          {/* Filtros de búsqueda y estado */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2,
                alignItems: { sm: 'center' },
                justifyContent: 'space-between',
              }}
            >
              <TextField
                id="category-search-input"
                label="Buscar categoría"
                placeholder="Filtrar por nombre o descripción..."
                size="small"
                value={searchTerm}
                onChange={handleSearchChange}
                sx={{ flex: 1, minWidth: { sm: 280 } }}
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

              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="status-filter-label">Estado</InputLabel>
                <Select
                  labelId="status-filter-label"
                  id="status-filter-select"
                  value={statusFilter}
                  label="Estado"
                  onChange={(e) => handleStatusFilterChange(e.target.value as StatusFilterOption)}
                >
                  <MenuItem value="active">Activas</MenuItem>
                  <MenuItem value="inactive">Inactivas</MenuItem>
                  <MenuItem value="all">Todas</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Paper>

          {/* Tabla de categorías */}
          <Paper variant="outlined">
            <TableContainer>
              <Table aria-label="Tabla de categorías de productos">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Nombre</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Descripción</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Última Actualización</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Acciones
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                        <CircularProgress size={32} />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Cargando categorías…
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : categories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          No se encontraron categorías
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {searchTerm || statusFilter !== 'all'
                            ? 'Prueba modificando los criterios de búsqueda o filtro.'
                            : 'Aún no se han registrado categorías en el sistema.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    categories.map((category) => (
                      <TableRow key={category.id} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{category.name}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', maxWidth: 300 }}>
                          {category.description || '—'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={category.isActive ? 'Activa' : 'Inactiva'}
                            color={category.isActive ? 'success' : 'default'}
                            size="small"
                            variant={category.isActive ? 'filled' : 'outlined'}
                          />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {new Date(category.updatedAt).toLocaleDateString('es-CO', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <PermissionGate permission={SYSTEM_PERMISSIONS.CATEGORIES_MANAGE}>
                            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, justifyContent: 'flex-end' }}>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => handleOpenEdit(category)}
                                aria-label={`Editar categoría ${category.name}`}
                              >
                                Editar
                              </Button>
                              {category.isActive ? (
                                <Button
                                  size="small"
                                  color="error"
                                  variant="outlined"
                                  onClick={() => handleOpenDeactivate(category)}
                                  aria-label={`Inactivar categoría ${category.name}`}
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
      <CategoryFormDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        category={selectedCategory}
      />

      <DeactivateCategoryDialog
        open={Boolean(categoryToDeactivate)}
        onClose={() => setCategoryToDeactivate(null)}
        category={categoryToDeactivate}
      />
    </Box>
  );
}
