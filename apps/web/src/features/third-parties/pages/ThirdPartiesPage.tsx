import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  Pagination,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  People as PeopleIcon,
} from '@mui/icons-material';
import type { ThirdPartyDto } from '@farmacia/contracts';
import { usePermissions } from '../../auth/hooks/usePermissions';
import {
  fetchThirdParties,
  deactivateThirdParty,
  activateThirdParty,
} from '../api/third-parties.api';
import { ThirdPartyFormDialog } from '../components/ThirdPartyFormDialog';

type RoleTab = 'ALL' | 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'OTHER';

export const ThirdPartiesPage: React.FC = () => {
  const { hasPermission, isAdmin } = usePermissions();
  const canManage = isAdmin || hasPermission('third_parties:manage');

  // Estados de consulta y filtros
  const [activeTab, setActiveTab] = useState<RoleTab>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Estados de datos
  const [thirdParties, setThirdParties] = useState<ThirdPartyDto[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados de modal y edición
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingThirdParty, setEditingThirdParty] = useState<ThirdPartyDto | null>(null);

  // Estado de confirmación de activación / desactivación
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    thirdParty: ThirdPartyDto | null;
    action: 'activate' | 'deactivate';
  }>({
    open: false,
    thirdParty: null,
    action: 'deactivate',
  });

  const loadThirdParties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchThirdParties({
        search: search.trim() || undefined,
        role: activeTab === 'ALL' ? undefined : activeTab,
        page,
        pageSize,
      });
      setThirdParties(response.items);
      setTotalPages(response.totalPages);
      setTotalCount(response.total);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar el directorio de terceros');
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, page, pageSize]);

  useEffect(() => {
    loadThirdParties();
  }, [loadThirdParties]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: RoleTab) => {
    setActiveTab(newValue);
    setPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleOpenCreate = () => {
    setEditingThirdParty(null);
    setFormDialogOpen(true);
  };

  const handleOpenEdit = (tp: ThirdPartyDto) => {
    setEditingThirdParty(tp);
    setFormDialogOpen(true);
  };

  const handleOpenConfirm = (tp: ThirdPartyDto, action: 'activate' | 'deactivate') => {
    setConfirmDialog({
      open: true,
      thirdParty: tp,
      action,
    });
  };

  const handleCloseConfirm = () => {
    setConfirmDialog({
      open: false,
      thirdParty: null,
      action: 'deactivate',
    });
  };

  const handleConfirmToggleStatus = async () => {
    if (!confirmDialog.thirdParty) return;
    try {
      if (confirmDialog.action === 'deactivate') {
        await deactivateThirdParty(confirmDialog.thirdParty.id);
      } else {
        await activateThirdParty(confirmDialog.thirdParty.id);
      }
      handleCloseConfirm();
      loadThirdParties();
    } catch (err: any) {
      alert(err?.message || 'Error al actualizar el estado del tercero');
    }
  };

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Encabezado */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PeopleIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 700 }} color="text.primary">
              Directorio de Terceros
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Gestión centralizada de clientes, proveedores, colaboradores y beneficiarios
          </Typography>
        </Box>

        {canManage && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ px: 2.5, py: 1, fontWeight: 600 }}
          >
            Nuevo Tercero
          </Button>
        )}
      </Box>

      {/* Tarjeta principal con tabs y filtros */}
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1 }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Todos los Terceros" value="ALL" />
            <Tab label="Clientes" value="CUSTOMER" />
            <Tab label="Proveedores" value="SUPPLIER" />
            <Tab label="Empleados / Colaboradores" value="EMPLOYEE" />
            <Tab label="Otros Beneficiarios" value="OTHER" />
          </Tabs>
        </Box>

        <CardContent sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Buscar por documento, nombre o razón social..."
              value={search}
              onChange={handleSearchChange}
              fullWidth
              sx={{ maxWidth: { sm: 450 } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              Total registrados: <strong>{totalCount}</strong>
            </Typography>
          </Box>
        </CardContent>

        {/* Tabla */}
        <TableContainer>
          <Table size="medium">
            <TableHead sx={{ backgroundColor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Identificación</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Nombre / Razón Social</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Tipo Persona</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Roles</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Régimen Tributario</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Contacto / Ubicación</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Estado</TableCell>
                {canManage && <TableCell align="right" sx={{ fontWeight: 600 }}>Acciones</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Cargando directorio de terceros...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'error.main' }}>
                    {error}
                  </TableCell>
                </TableRow>
              ) : thirdParties.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Typography variant="body1" color="text.secondary">
                      No se encontraron terceros registrados con los filtros aplicados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                thirdParties.map((tp) => (
                  <TableRow key={tp.id} hover sx={{ opacity: tp.isActive ? 1 : 0.6 }}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {tp.documentType} {tp.documentNumber}
                        {tp.verificationDigit ? `-${tp.verificationDigit}` : ''}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {tp.name}
                      </Typography>
                      {tp.tradeName && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Comercial: {tp.tradeName}
                        </Typography>
                      )}
                      {tp.contactName && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Contacto: {tp.contactName}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={tp.personType === 'JURIDICA' ? 'Jurídica' : 'Natural'}
                        size="small"
                        variant="outlined"
                        color={tp.personType === 'JURIDICA' ? 'primary' : 'default'}
                      />
                    </TableCell>

                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {tp.isCustomer && (
                          <Chip label="Cliente" size="small" color="success" sx={{ fontSize: 11, height: 22 }} />
                        )}
                        {tp.isSupplier && (
                          <Chip label="Proveedor" size="small" color="info" sx={{ fontSize: 11, height: 22 }} />
                        )}
                        {tp.isEmployee && (
                          <Chip label="Empleado" size="small" color="secondary" sx={{ fontSize: 11, height: 22 }} />
                        )}
                        {tp.isOther && (
                          <Chip label="Otro" size="small" variant="outlined" sx={{ fontSize: 11, height: 22 }} />
                        )}
                      </Box>
                    </TableCell>

                    <TableCell>
                      <Typography variant="caption" color="text.primary">
                        {tp.taxRegime === 'RESPONSABLE_IVA'
                          ? 'Resp. IVA'
                          : tp.taxRegime === 'NO_RESPONSABLE_IVA'
                          ? 'No Resp. IVA'
                          : tp.taxRegime === 'REGIMEN_SIMPLE'
                          ? 'Simple (RST)'
                          : tp.taxRegime === 'GRAN_CONTRIBUYENTE'
                          ? 'Gran Contribuyente'
                          : tp.taxRegime === 'AUTORRETENEDOR'
                          ? 'Autorretenedor'
                          : tp.taxRegime}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      {tp.city && (
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          {tp.city}{tp.department ? `, ${tp.department}` : ''}
                        </Typography>
                      )}
                      {tp.phone && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Tel: {tp.phone}
                        </Typography>
                      )}
                      {tp.email && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {tp.email}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={tp.isActive ? 'Activo' : 'Inactivo'}
                        color={tp.isActive ? 'success' : 'default'}
                        size="small"
                        sx={{ fontSize: 11, height: 22 }}
                      />
                    </TableCell>

                    {canManage && (
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Tooltip title="Editar Tercero">
                            <IconButton size="small" onClick={() => handleOpenEdit(tp)} color="primary">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          {tp.isActive ? (
                            <Tooltip title="Desactivar Tercero">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenConfirm(tp, 'deactivate')}
                                color="warning"
                              >
                                <BlockIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Activar Tercero">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenConfirm(tp, 'activate')}
                                color="success"
                              >
                                <CheckCircleIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Paginación */}
        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, borderTop: 1, borderColor: 'divider' }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, newPage) => setPage(newPage)}
              color="primary"
            />
          </Box>
        )}
      </Card>

      {/* Modal de Creación / Edición */}
      <ThirdPartyFormDialog
        open={formDialogOpen}
        onClose={() => setFormDialogOpen(false)}
        onSaved={loadThirdParties}
        thirdPartyToEdit={editingThirdParty}
      />

      {/* Diálogo de Confirmación Desactivación / Activación */}
      <Dialog open={confirmDialog.open} onClose={handleCloseConfirm}>
        <DialogTitle>
          {confirmDialog.action === 'deactivate' ? 'Desactivar Tercero' : 'Activar Tercero'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Está seguro que desea {confirmDialog.action === 'deactivate' ? 'desactivar' : 'activar'} al tercero{' '}
            <strong>{confirmDialog.thirdParty?.name}</strong> (
            {confirmDialog.thirdParty?.documentType} {confirmDialog.thirdParty?.documentNumber})?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseConfirm}>Cancelar</Button>
          <Button
            onClick={handleConfirmToggleStatus}
            color={confirmDialog.action === 'deactivate' ? 'warning' : 'success'}
            variant="contained"
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
