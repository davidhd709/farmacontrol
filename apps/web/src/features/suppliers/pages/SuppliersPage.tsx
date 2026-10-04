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
} from '@mui/material';
import type { SupplierDto } from '@farmacia/contracts';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { fetchSuppliers, deactivateSupplier } from '../api/suppliers.api';
import { SupplierFormDialog } from '../components/SupplierFormDialog';
import { PermissionGate } from '../../auth/components/PermissionGate';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { SweetModal } from '../../../components/SweetModal';

export const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Diálogo Crear/Editar
  const [formOpen, setFormOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierDto | null>(null);

  // Diálogo Inactivar
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [supplierToDeactivate, setSupplierToDeactivate] = useState<SupplierDto | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Notificaciones
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const isActiveParam =
        statusFilter === 'ACTIVE' ? true : statusFilter === 'INACTIVE' ? false : undefined;

      const response = await fetchSuppliers({
        search: searchTerm.trim() || undefined,
        isActive: isActiveParam,
      });
      setSuppliers(response.items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al consultar proveedores.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const handleOpenCreate = () => {
    setSelectedSupplier(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (supplier: SupplierDto) => {
    setSelectedSupplier(supplier);
    setFormOpen(true);
  };

  const handleOpenDeactivate = (supplier: SupplierDto) => {
    setSupplierToDeactivate(supplier);
    setDeactivateDialogOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!supplierToDeactivate) return;
    setActionLoading(true);
    try {
      await deactivateSupplier(supplierToDeactivate.id);
      setToastMsg(`Proveedor "${supplierToDeactivate.name}" inactivado correctamente.`);
      setDeactivateDialogOpen(false);
      setSupplierToDeactivate(null);
      loadSuppliers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al inactivar proveedor.';
      setErrorMsg(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Encabezado */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HomeBackButton />
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 800, color: 'text.primary' }}>
              Directorio de Proveedores
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Administración de proveedores de medicamentos y distribuidores comerciales.
            </Typography>
          </Box>
        </Box>

        <PermissionGate permission={SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenCreate}
            sx={{
              fontWeight: 700,
              px: 3,
              py: 1,
              textTransform: 'none',
              transition: 'transform 0.1s ease, background-color 0.15s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            + Nuevo Proveedor
          </Button>
        </PermissionGate>
      </Box>

      {/* Alertas */}
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {/* Barra de Búsqueda y Filtros */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          label="Buscar por NIT, Razón Social o Contacto"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Ej. Distribuidora, 900123..."
          size="small"
          sx={{ minWidth: 320, flexGrow: 1 }}
        />

        <TextField
          select
          label="Estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          size="small"
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="ALL">Todos los estados</MenuItem>
          <MenuItem value="ACTIVE">Solo Activos</MenuItem>
          <MenuItem value="INACTIVE">Solo Inactivos</MenuItem>
        </TextField>

        <Button variant="outlined" onClick={loadSuppliers} disabled={loading} size="medium">
          Actualizar
        </Button>
      </Paper>

      {/* Tabla de Proveedores */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : suppliers.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No se encontraron proveedores
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {searchTerm
              ? 'Intenta con otro término de búsqueda o limpia los filtros.'
              : 'Aún no hay proveedores registrados en el sistema.'}
          </Typography>
          <PermissionGate permission={SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE}>
            <Button variant="contained" onClick={handleOpenCreate}>
              Registrar Primer Proveedor
            </Button>
          </PermissionGate>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ boxShadow: 1, borderRadius: 1.5 }}>
          <Table aria-label="Tabla de proveedores">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>NIT / Documento</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Razón Social</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Contacto</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Teléfono / Email</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Dirección</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Estado</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {supplier.taxId}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {supplier.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {supplier.contactName || (
                      <Typography variant="caption" color="text.disabled">
                        Sin contacto
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      {supplier.phone && (
                        <Typography variant="body2">{supplier.phone}</Typography>
                      )}
                      {supplier.email && (
                        <Typography variant="caption" color="text.secondary">
                          {supplier.email}
                        </Typography>
                      )}
                      {!supplier.phone && !supplier.email && (
                        <Typography variant="caption" color="text.disabled">
                          Sin teléfono/email
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {supplier.address || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Chip
                      label={supplier.isActive ? 'Activo' : 'Inactivo'}
                      color={supplier.isActive ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                      sx={{
                        fontWeight: 700,
                        bgcolor: supplier.isActive ? 'rgba(46, 125, 50, 0.04)' : undefined,
                        borderColor: supplier.isActive ? 'rgba(46, 125, 50, 0.4)' : undefined,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <PermissionGate permission={SYSTEM_PERMISSIONS.SUPPLIERS_MANAGE}>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleOpenEdit(supplier)}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            transition: 'transform 0.1s ease',
                            '&:active': { transform: 'scale(0.98)' },
                          }}
                        >
                          Editar
                        </Button>
                        {supplier.isActive && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleOpenDeactivate(supplier)}
                            sx={{
                              textTransform: 'none',
                              fontWeight: 600,
                              transition: 'transform 0.1s ease',
                              '&:active': { transform: 'scale(0.98)' },
                            }}
                          >
                            Inactivar
                          </Button>
                        )}
                      </Box>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Modal Formulario Crear / Editar */}
      <SupplierFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          loadSuppliers();
          setToastMsg(
            selectedSupplier
              ? 'Proveedor actualizado correctamente.'
              : 'Proveedor registrado exitosamente.'
          );
        }}
        supplierToEdit={selectedSupplier}
      />

      {/* Diálogo Confirmación de Inactivación */}
      <ConfirmDialog
        open={deactivateDialogOpen}
        title="Confirmar Inactivación de Proveedor"
        description={`¿Estás seguro de que deseas inactivar al proveedor ${supplierToDeactivate?.name || ''} (NIT: ${supplierToDeactivate?.taxId || ''})? Al inactivarlo, no podrá ser seleccionado para nuevas recepciones de compras, conservando todo el historial de compras previas.`}
        confirmText="Confirmar Inactivación"
        confirmColor="error"
        isLoading={actionLoading}
        onConfirm={handleConfirmDeactivate}
        onCancel={() => {
          if (!actionLoading) {
            setDeactivateDialogOpen(false);
            setSupplierToDeactivate(null);
          }
        }}
      />

      {/* Modal de Evento / Notificación SweetAlert */}
      <SweetModal
        open={Boolean(toastMsg)}
        type="success"
        title="¡Buen trabajo!"
        description={toastMsg}
        confirmText="OK"
        onConfirm={() => setToastMsg(null)}
        onClose={() => setToastMsg(null)}
      />
    </Box>
  );
};
