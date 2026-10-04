import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
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
  Typography,
} from '@mui/material';
import { UnitOfMeasureDto } from '@farmacia/contracts';
import {
  useUnitsOfMeasure,
  useCreateUnitOfMeasure,
  useUpdateUnitOfMeasure,
  useDeactivateUnitOfMeasure,
} from '../hooks/useUnitsOfMeasure';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { SweetModal } from '../../../components/SweetModal';

const CATEGORY_LABELS: Record<string, { label: string; color: 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'default' }> = {
  FARMACEUTICA: { label: 'Medicamento / Farma', color: 'primary' },
  EMPAQUE: { label: 'Empaque / Contenedor', color: 'secondary' },
  RETAIL: { label: 'Snacks / Bebidas / Retail', color: 'success' },
  PESO_VOLUMEN: { label: 'Peso / Volumen', color: 'info' },
  GENERAL: { label: 'General / Unidad', color: 'default' },
};

export const UnitsOfMeasurePage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitOfMeasureDto | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('FARMACEUTICA');
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [unitToToggle, setUnitToToggle] = useState<UnitOfMeasureDto | null>(null);

  // Notificación flotante (Snackbar)
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const queryFilters = {
    search: searchTerm.trim() || undefined,
    category: categoryFilter === 'all' ? undefined : categoryFilter,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
    page: page + 1,
    pageSize,
  };

  const { data, isLoading, isError, error } = useUnitsOfMeasure(queryFilters);
  const createMutation = useCreateUnitOfMeasure();
  const updateMutation = useUpdateUnitOfMeasure();
  const deactivateMutation = useDeactivateUnitOfMeasure();

  const handleOpenCreate = () => {
    setEditingUnit(null);
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormCategory('FARMACEUTICA');
    setFormError(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (unit: UnitOfMeasureDto) => {
    setEditingUnit(unit);
    setFormCode(unit.code);
    setFormName(unit.name);
    setFormDescription(unit.description || '');
    setFormCategory(unit.category || 'GENERAL');
    setFormError(null);
    setFormOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formCode.trim()) {
      setFormError('El código o abreviatura es obligatorio.');
      return;
    }
    if (!formName.trim()) {
      setFormError('El nombre de la unidad es obligatorio.');
      return;
    }

    try {
      if (editingUnit) {
        await updateMutation.mutateAsync({
          id: editingUnit.id,
          payload: {
            name: formName.trim(),
            description: formDescription.trim() || null,
            category: formCategory,
          },
        });
        setSnackbar({
          open: true,
          message: `Unidad de medida "${formName.trim()}" actualizada con éxito.`,
          severity: 'success',
        });
      } else {
        await createMutation.mutateAsync({
          code: formCode.trim().toUpperCase(),
          name: formName.trim(),
          description: formDescription.trim() || null,
          category: formCategory,
        });
        setSnackbar({
          open: true,
          message: `Unidad de medida "${formName.trim()}" creada exitosamente.`,
          severity: 'success',
        });
      }
      setFormOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar la unidad de medida.';
      setFormError(msg);
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  const handleToggleActive = async () => {
    if (!unitToToggle) return;
    try {
      if (unitToToggle.isActive) {
        await deactivateMutation.mutateAsync(unitToToggle.id);
      } else {
        await updateMutation.mutateAsync({
          id: unitToToggle.id,
          payload: { isActive: true },
        });
      }
      setSnackbar({
        open: true,
        message: `Unidad "${unitToToggle.name}" ${unitToToggle.isActive ? 'inactivada' : 'reactivada'} con éxito.`,
        severity: 'success',
      });
      setConfirmDeactivateOpen(false);
      setUnitToToggle(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cambiar estado de la unidad.';
      setSnackbar({ open: true, message: msg, severity: 'error' });
      setConfirmDeactivateOpen(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1300, margin: '0 auto' }}>
      {/* Encabezado */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HomeBackButton />
          <Box>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
              Unidades de Medida y Presentaciones
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Gestión centralizada de unidades base farmacéuticas, empaques y retail (snacks, bebidas, etc.).
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" color="primary" onClick={handleOpenCreate} sx={{ fontWeight: 700 }}>
          + Nueva Unidad
        </Button>
      </Box>

      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Buscar por código, nombre o descripción..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
            size="small"
            sx={{ flex: 1 }}
          />

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Tipo de Unidad</InputLabel>
            <Select
              value={categoryFilter}
              label="Tipo de Unidad"
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="all">Todos los Tipos</MenuItem>
              <MenuItem value="FARMACEUTICA">Medicamento / Farma</MenuItem>
              <MenuItem value="EMPAQUE">Empaque / Contenedor</MenuItem>
              <MenuItem value="RETAIL">Snacks / Bebidas / Retail</MenuItem>
              <MenuItem value="PESO_VOLUMEN">Peso / Volumen</MenuItem>
              <MenuItem value="GENERAL">General / Indivisible</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Estado</InputLabel>
            <Select
              value={statusFilter}
              label="Estado"
              onChange={(e) => {
                setStatusFilter(e.target.value as 'active' | 'inactive' | 'all');
                setPage(0);
              }}
            >
              <MenuItem value="active">Solo Activas</MenuItem>
              <MenuItem value="inactive">Inactivas</MenuItem>
              <MenuItem value="all">Todas</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Tabla de Unidades de Medida */}
      <TableContainer component={Paper}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
            <CircularProgress />
          </Box>
        ) : isError ? (
          <Alert severity="error" sx={{ m: 2 }}>
            {error instanceof Error ? error.message : 'Error al cargar unidades de medida.'}
          </Alert>
        ) : (
          <>
            <Table size="small">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, width: '12%' }}>Código</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '25%' }}>Nombre de Unidad</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '22%' }}>Categoría / Tipo</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '25%' }}>Descripción / Uso Sugerido</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '8%', textAlign: 'center' }}>Estado</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: '8%', textAlign: 'center' }}>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      <Typography variant="body2" color="text.secondary">
                        No se encontraron unidades de medida con los filtros aplicados.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.items.map((unit) => {
                    const catInfo = CATEGORY_LABELS[unit.category] || { label: unit.category, color: 'default' };
                    return (
                      <TableRow key={unit.id} hover>
                        <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                          <Chip label={unit.code} size="small" variant="filled" sx={{ fontWeight: 'bold' }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{unit.name}</TableCell>
                        <TableCell>
                          <Chip label={catInfo.label} size="small" color={catInfo.color} variant="outlined" />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                          {unit.description || '—'}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={unit.isActive ? 'Activa' : 'Inactiva'}
                            size="small"
                            color={unit.isActive ? 'success' : 'default'}
                            variant={unit.isActive ? 'filled' : 'outlined'}
                            sx={{ height: 22, fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                            <Button size="small" variant="text" onClick={() => handleOpenEdit(unit)}>
                              Editar
                            </Button>
                            <Button
                              size="small"
                              color={unit.isActive ? 'error' : 'primary'}
                              variant="text"
                              onClick={() => {
                                setUnitToToggle(unit);
                                setConfirmDeactivateOpen(true);
                              }}
                            >
                              {unit.isActive ? 'Inactivar' : 'Activar'}
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={data?.total ?? 0}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={pageSize}
              onRowsPerPageChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 15, 25, 50]}
              labelRowsPerPage="Filas por página:"
            />
          </>
        )}
      </TableContainer>

      {/* Modal de Crear / Editar Unidad */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSaveForm}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {editingUnit ? `Editar Unidad: ${editingUnit.name}` : 'Nueva Unidad de Medida'}
          </DialogTitle>
          <DialogContent>
            {formError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {formError}
              </Alert>
            )}

            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <TextField
                label="Código o Abreviatura *"
                placeholder="Ej. TAB, BLIS, CAJ, LAT, BOT, PQT, UND"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                disabled={Boolean(editingUnit)}
                helperText={editingUnit ? 'El código identificador no puede modificarse.' : 'Abreviatura corta única (máx. 20 caracteres)'}
                required
                fullWidth
              />

              <TextField
                label="Nombre de la Unidad *"
                placeholder="Ej. Tableta / Pastilla, Blíster, Lata, Botella"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                fullWidth
              />

              <FormControl fullWidth required>
                <InputLabel>Categoría / Tipo de Producto</InputLabel>
                <Select
                  value={formCategory}
                  label="Categoría / Tipo de Producto"
                  onChange={(e) => setFormCategory(e.target.value)}
                >
                  <MenuItem value="FARMACEUTICA">Medicamento / Farmacéutica (Pastilla, Cápsula, Ampolla, Jarabe)</MenuItem>
                  <MenuItem value="EMPAQUE">Empaque / Contenedor (Blíster, Caja, Tubo)</MenuItem>
                  <MenuItem value="RETAIL">Snacks / Bebidas / Retail (Paquete, Lata, Botella, Six-Pack, Paca)</MenuItem>
                  <MenuItem value="PESO_VOLUMEN">Peso / Volumen (mL, L, g, kg)</MenuItem>
                  <MenuItem value="GENERAL">General / Indivisible (Unidad, Pieza, Bolsa)</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Descripción o Uso Sugerido"
                placeholder="Ej. Para fraccionamiento de analgésicos o venta suelta en POS"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                multiline
                rows={2}
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setFormOpen(false)} color="inherit">
              Cancelar
            </Button>
            <Button type="submit" variant="contained" color="primary" sx={{ fontWeight: 700 }}>
              {editingUnit ? 'Guardar Cambios' : 'Crear Unidad'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Diálogo de Confirmación Inactivar/Activar */}
      <ConfirmDialog
        open={confirmDeactivateOpen}
        onClose={() => setConfirmDeactivateOpen(false)}
        onConfirm={handleToggleActive}
        isLoading={deactivateMutation.isPending || updateMutation.isPending}
        title={unitToToggle?.isActive ? 'Inactivar Unidad de Medida' : 'Reactivar Unidad de Medida'}
        description={
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              ¿Estás seguro de que deseas {unitToToggle?.isActive ? 'inactivar' : 'reactivar'} la unidad{' '}
              <strong>{unitToToggle?.name} ({unitToToggle?.code})</strong>?
            </Typography>
            {unitToToggle?.isActive && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                ⚠️ Los productos que ya usan esta unidad conservarán su histórico, pero no se sugerirá para nuevos registros.
              </Typography>
            )}
          </Stack>
        }
        confirmText={unitToToggle?.isActive ? 'Inactivar' : 'Reactivar'}
        confirmColor={unitToToggle?.isActive ? 'error' : 'primary'}
      />

      {/* Notificación modal estilo SweetAlert2 */}
      <SweetModal
        open={snackbar.open}
        type={snackbar.severity === 'error' ? 'error' : snackbar.severity === 'warning' ? 'warning' : 'success'}
        title={snackbar.severity === 'error' ? '¡Error!' : '¡Buen trabajo!'}
        text={snackbar.message}
        confirmText="OK"
        onConfirm={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
};
