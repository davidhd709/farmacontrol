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
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip,
} from '@mui/material';
import type { CustomerDto } from '@farmacia/contracts';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { HomeBackButton } from '../../../components/HomeBackButton';
import { fetchCustomers, deactivateCustomer } from '../api/customers.api';
import { CustomerFormDialog } from '../components/CustomerFormDialog';
import { PermissionGate } from '../../auth/components/PermissionGate';

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Diálogo Crear/Editar
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);

  // Diálogo Inactivar
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [customerToDeactivate, setCustomerToDeactivate] = useState<CustomerDto | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Notificaciones
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const isActiveParam =
        statusFilter === 'ACTIVE' ? true : statusFilter === 'INACTIVE' ? false : undefined;

      const response = await fetchCustomers({
        search: searchTerm.trim() || undefined,
        isActive: isActiveParam,
      });
      setCustomers(response.items || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al consultar clientes.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleOpenCreate = () => {
    setSelectedCustomer(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (customer: CustomerDto) => {
    setSelectedCustomer(customer);
    setFormOpen(true);
  };

  const handleOpenDeactivate = (customer: CustomerDto) => {
    setCustomerToDeactivate(customer);
    setDeactivateDialogOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!customerToDeactivate) return;
    setActionLoading(true);
    try {
      await deactivateCustomer(customerToDeactivate.id);
      setToastMsg(`Cliente ${customerToDeactivate.name} inactivado correctamente.`);
      setDeactivateDialogOpen(false);
      setCustomerToDeactivate(null);
      await loadCustomers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo inactivar el cliente.';
      setErrorMsg(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1280, margin: '0 auto' }}>
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
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, color: 'text.primary' }}>
              Directorio de Clientes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Gestione la base de datos de clientes para el Punto de Venta (POS) y facturación.
            </Typography>
          </Box>
        </Box>

        <PermissionGate permission={SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenCreate}
            sx={{ fontWeight: 600, textTransform: 'none', px: 3 }}
          >
            + Nuevo Cliente
          </Button>
        </PermissionGate>
      </Box>

      {errorMsg && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {/* Barra de Filtros */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }} elevation={1}>
        <TextField
          label="Buscar por Documento o Nombre"
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Ej: 1020304050 o Juan..."
          sx={{ minWidth: 280, flexGrow: 1 }}
        />

        <TextField
          select
          label="Estado"
          size="small"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="ALL">Todos los estados</MenuItem>
          <MenuItem value="ACTIVE">Solo Activos</MenuItem>
          <MenuItem value="INACTIVE">Solo Inactivos</MenuItem>
        </TextField>

        <Button variant="outlined" color="inherit" onClick={loadCustomers} disabled={loading}>
          Actualizar
        </Button>
      </Paper>

      {/* Tabla de Clientes */}
      <TableContainer component={Paper} elevation={1}>
        <Table aria-label="tabla de clientes">
          <TableHead sx={{ backgroundColor: 'action.hover' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Tipo / Documento</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Nombre o Razón Social</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Teléfono</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Correo</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Estado</TableCell>
              <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                  <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
                    Cargando directorio de clientes...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <Typography variant="body1" color="text.secondary">
                    No se encontraron clientes con los filtros aplicados.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {c.documentType} {c.documentNumber}
                      </Typography>
                      {c.isDefault && (
                        <Chip
                          label="Predeterminado POS"
                          size="small"
                          color="info"
                          variant="outlined"
                          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {c.name}
                    </Typography>
                    {c.address && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {c.address}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{c.phone || '-'}</TableCell>
                  <TableCell>{c.email || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={c.isActive ? 'Activo' : 'Inactivo'}
                      color={c.isActive ? 'success' : 'default'}
                      size="small"
                      variant="filled"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                      <PermissionGate permission={SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE}>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => handleOpenEdit(c)}
                        >
                          Editar
                        </Button>
                      </PermissionGate>

                      <PermissionGate permission={SYSTEM_PERMISSIONS.CUSTOMERS_MANAGE}>
                        {c.isDefault ? (
                          <Tooltip title="El cliente predeterminado no puede ser inactivado">
                            <span>
                              <Button size="small" variant="text" color="error" disabled>
                                Inactivar
                              </Button>
                            </span>
                          </Tooltip>
                        ) : c.isActive ? (
                          <Button
                            size="small"
                            variant="text"
                            color="error"
                            onClick={() => handleOpenDeactivate(c)}
                          >
                            Inactivar
                          </Button>
                        ) : null}
                      </PermissionGate>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Diálogo Crear / Editar */}
      <CustomerFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadCustomers}
        customerToEdit={selectedCustomer}
      />

      {/* Diálogo Confirmar Inactivación */}
      <Dialog
        open={deactivateDialogOpen}
        onClose={() => (actionLoading ? null : setDeactivateDialogOpen(false))}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>Confirmar Inactivación</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Está seguro de que desea inactivar al cliente{' '}
            <strong>{customerToDeactivate?.name}</strong> (Documento:{' '}
            {customerToDeactivate?.documentNumber})? Los clientes inactivos no aparecerán en las
            búsquedas del Punto de Venta.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setDeactivateDialogOpen(false)}
            disabled={actionLoading}
            color="inherit"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmDeactivate}
            color="error"
            variant="contained"
            disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : null}
          >
            Confirmar Inactivación
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast Notificaciones */}
      <Snackbar
        open={Boolean(toastMsg)}
        autoHideDuration={4000}
        onClose={() => setToastMsg(null)}
        message={toastMsg}
      />
    </Box>
  );
};
